#!/usr/bin/env python3
"""Extract tracker documents offline; optionally create a metadata-only backup copy."""
import argparse
import base64
import copy
import json
from pathlib import Path


def decoded_chunks(value):
    if not isinstance(value, str) or len(value) % 4:
        raise ValueError("Invalid base64 document payload.")
    padding = value.find("=")
    if padding != -1 and padding < len(value) - 2:
        raise ValueError("Invalid base64 document padding.")
    for offset in range(0, len(value), 64 * 1024):
        yield base64.b64decode(value[offset:offset + 64 * 1024], validate=True)


def recover(source: Path, destination: Path, metadata_only: bool = False):
    backup = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(backup, dict) or not isinstance(backup.get("snapshot"), dict):
        raise ValueError("The backup is missing its tracker snapshot.")
    if type(backup.get("schemaVersion")) is not int or backup["schemaVersion"] not in (1, 2, 3):
        raise ValueError("Unsupported backup schema; use a matching tracker version.")
    version = backup["snapshot"].get("dataVersion", 1)
    if type(version) is not int or version not in (1, 2, 3):
        raise ValueError("Unsupported tracker data version; use a matching tracker version.")
    restored = copy.deepcopy(backup) if metadata_only else None
    extracted = []
    manifest = []
    for collection, payloads, prefix in (
        ("resumes", "resumeFiles", "resume"),
        ("coverLetters", "coverLetterFiles", "cover-letter"),
    ):
        documents = backup["snapshot"].get(collection, [])
        payload_list = backup.get(payloads, [])
        if not isinstance(documents, list) or not isinstance(payload_list, list):
            raise ValueError("Document metadata and payload collections must be arrays.")
        if any(not isinstance(item, dict) or not isinstance(item.get("storageKey"), str)
               or not item["storageKey"].strip() for item in payload_list):
            raise ValueError("Invalid document payload metadata.")
        files = {item["storageKey"]: item for item in payload_list}
        if len(files) != len(payload_list):
            raise ValueError("Duplicate document payload keys.")
        seen_keys = set()
        seen_ids = set()
        for index, document in enumerate(documents):
            if (not isinstance(document, dict)
                    or not isinstance(document.get("id"), str) or not document["id"].strip()
                    or not isinstance(document.get("storageKey"), str) or not document["storageKey"].strip()
                    or type(document.get("fileSize")) is not int or document["fileSize"] < 0):
                raise ValueError("Invalid document metadata.")
            key = document["storageKey"]
            if key in seen_keys or document["id"] in seen_ids:
                raise ValueError("Duplicate document identity.")
            seen_keys.add(key)
            seen_ids.add(document["id"])
            payload = files.pop(key, None)
            if payload is None:
                if document["fileSize"] > 0:
                    raise ValueError(f"Missing file for document {document['id']}; original kept.")
                continue
            extension = document["fileExtension"]
            if extension not in ("pdf", "docx"):
                raise ValueError("Unsupported document extension.")
            signature = b"%PDF-" if extension == "pdf" else b"PK\x03\x04"
            size = 0
            signature_prefix = b""
            for chunk in decoded_chunks(payload["dataBase64"]):
                size += len(chunk)
                if not signature_prefix:
                    signature_prefix = chunk[:5]
            if size != document["fileSize"] or not signature_prefix.startswith(signature):
                raise ValueError(f"Invalid contents for document {document['id']}; original kept.")
            # Never use untrusted IDs, keys or original filenames as output paths.
            name = f"{prefix}-{index + 1:05d}.{extension}"
            extracted.append((name, payload["dataBase64"]))
            manifest.append({"file": name, "documentId": document["id"],
                             "storageKey": key, "originalFileName": document["originalFileName"]})
        if files:
            raise ValueError("Unlinked document payloads; inspect the original backup.")
        if metadata_only:
            restored[payloads] = []
            for index, document in enumerate(restored["snapshot"].get(collection, [])):
                document.setdefault("recoveryOriginalFileSize", document["fileSize"])
                document["fileSize"] = 0
                document.setdefault("recoveryOriginalStorageKey", document["storageKey"])
                document["storageKey"] = f"recovered-{prefix}-{index + 1:05d}"

    # Refuse overwrites. All validation above completes before creating output.
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    for name, encoded in extracted:
        with (destination / name).open("xb") as output:
            for chunk in decoded_chunks(encoded):
                output.write(chunk)
    with (destination / "manifest.json").open("x", encoding="utf-8") as output:
        json.dump(manifest, output, ensure_ascii=True, indent=2)
    if metadata_only:
        # ASCII escaping preserves even a lone surrogate from JavaScript JSON.
        with (destination / "metadata-backup.json").open("x", encoding="utf-8") as output:
            json.dump(restored, output, ensure_ascii=True)
    return len(extracted)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path, help="New output directory; must not exist")
    parser.add_argument("--metadata-only", action="store_true", help="Also create a copy retaining document metadata/links but excluding attachments")
    args = parser.parse_args()
    try:
        count = recover(args.source, args.destination, args.metadata_only)
    except (ValueError, KeyError, TypeError, OSError, RecursionError) as error:
        parser.exit(1, f"Recovery failed: {error}\n")
    print(f"Extracted {count} documents. Original backup was not modified.")
    if args.metadata_only:
        print("metadata-backup.json excludes all attachments. Preview it in the tracker before restoring.")


if __name__ == "__main__":
    main()
