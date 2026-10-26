import base64
import copy
import json
from pathlib import Path
import tempfile
import unittest

from recover_backup import recover


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "original.json"
        self.output = self.root / "recovered"
        self.data = b"%PDF-" + b"x" * (10 * 1024 * 1024)  # Previously valid legacy file.
        self.backup = {
            "schemaVersion": 1,
            "snapshot": {
                "applications": [{"resumeId": "r", "notes": "Keep Unicode 界 \ud800"}],
                "resumes": [{"id": "r", "storageKey": "../../escape", "fileSize": len(self.data),
                             "originalFileName": "../../secret.pdf", "fileExtension": "pdf"}],
            },
            "resumeFiles": [{"storageKey": "../../escape", "dataBase64": base64.b64encode(self.data).decode()}],
        }
        self.save()

    def save(self):
        self.source.write_text(json.dumps(self.backup), encoding="utf-8")

    def test_extracts_oversized_legacy_file_without_overwriting_source_or_using_untrusted_paths(self):
        original = self.source.read_bytes()
        self.assertEqual(recover(self.source, self.output, True), 1)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual((self.output / "resume-00001.pdf").read_bytes(), self.data)
        restored = json.loads((self.output / "metadata-backup.json").read_text())
        self.assertEqual(restored["snapshot"]["applications"], self.backup["snapshot"]["applications"])
        self.assertEqual(restored["snapshot"]["resumes"][0]["fileSize"], 0)
        self.assertEqual(restored["snapshot"]["resumes"][0]["recoveryOriginalFileSize"], len(self.data))
        self.assertEqual(restored["resumeFiles"], [])
        self.assertEqual(len(list(self.output.iterdir())), 3)
        with self.assertRaises(FileExistsError):
            recover(self.source, self.output, True)

    def test_extract_only_does_not_create_a_reduced_backup(self):
        recover(self.source, self.output)
        self.assertFalse((self.output / "metadata-backup.json").exists())

    def test_rejects_corrupted_payload_before_creating_output(self):
        self.backup["resumeFiles"][0]["dataBase64"] = "bad!"
        self.save()
        with self.assertRaises(ValueError):
            recover(self.source, self.output, True)
        self.assertFalse(self.output.exists())

    def test_rejects_missing_file_before_creating_output(self):
        self.backup["resumeFiles"] = []
        self.save()
        with self.assertRaisesRegex(ValueError, "Missing file"):
            recover(self.source, self.output, True)
        self.assertFalse(self.output.exists())

    def test_rejects_malformed_structures_before_creating_output(self):
        original = copy.deepcopy(self.backup)
        cases = [
            [],
            {**original, "schemaVersion": True},
            {**original, "snapshot": {**original["snapshot"], "dataVersion": 4}},
            {**original, "snapshot": {**original["snapshot"], "resumes": {"not": "an array"}}},
            {**original, "resumeFiles": None},
            {**original, "resumeFiles": [None]},
            {**original, "resumeFiles": [{"storageKey": []}]},
            {**original, "snapshot": {**original["snapshot"], "resumes": [None]}},
            {**original, "snapshot": {**original["snapshot"], "resumes": [{"id": "r", "storageKey": "key", "fileSize": True}]}},
        ]
        for malformed in cases:
            with self.subTest(malformed=type(malformed).__name__):
                self.backup = malformed
                self.save()
                with self.assertRaises(ValueError):
                    recover(self.source, self.output, True)
                self.assertFalse(self.output.exists())

    def test_rejects_duplicate_metadata_even_when_the_second_entry_has_no_file(self):
        duplicate = {**self.backup["snapshot"]["resumes"][0], "fileSize": 0}
        self.backup["snapshot"]["resumes"].append(duplicate)
        self.save()
        with self.assertRaisesRegex(ValueError, "Duplicate document identity"):
            recover(self.source, self.output, True)
        self.assertFalse(self.output.exists())

    def test_rejects_interior_padding_across_decode_chunks(self):
        self.backup["resumeFiles"][0]["dataBase64"] = "QUFB" * 16_383 + "QQ==" + "QUFB"
        self.save()
        with self.assertRaisesRegex(ValueError, "padding"):
            recover(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_preserves_existing_recovery_provenance(self):
        document = self.backup["snapshot"]["resumes"][0]
        document["fileSize"] = 0
        document["recoveryOriginalFileSize"] = 42
        document["recoveryOriginalStorageKey"] = "original-key"
        self.backup["resumeFiles"] = []
        self.save()
        recover(self.source, self.output, True)
        restored = json.loads((self.output / "metadata-backup.json").read_text())
        document = restored["snapshot"]["resumes"][0]
        self.assertEqual(document["recoveryOriginalFileSize"], 42)
        self.assertEqual(document["recoveryOriginalStorageKey"], "original-key")


if __name__ == "__main__":
    unittest.main()
