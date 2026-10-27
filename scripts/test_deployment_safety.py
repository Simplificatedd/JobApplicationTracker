"""CI must validate main/PR/manual events without credentials or publication.

Historical runs keep their old YAML: this source check cannot revoke their tokens.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


def assert_validation_only(ci):
    jobs = ci.split("\njobs:\n", 1)[1]
    if re.findall(r"^  ([\w-]+):", jobs, re.M) != ["verify"]:
        raise AssertionError("CI may only contain the validation job")
    if re.search(r"\bsecrets\s*(?:\.|\[)|environment:|pages deploy|wrangler-action|deployments:", ci):
        raise AssertionError("CI must not acquire deployment credentials or publish")
    if re.findall(r"^ *uses: (.+)$", ci, re.M) != ["actions/checkout@v4", "actions/setup-node@v4"]:
        raise AssertionError("Additional actions require deployment-safety review")
    commands = re.findall(r"^ *run: (.+)$", ci, re.M)
    if commands != ["npm ci", "npm run check", "python3 -B -m unittest discover -s scripts -p 'test_*.py'"]:
        raise AssertionError("CI must preserve the reviewed validation commands")


class DeploymentSafetyTests(unittest.TestCase):
    def test_current_ci_cannot_publish(self):
        assert_validation_only((ROOT / ".github/workflows/ci.yml").read_text())

    def test_main_pr_and_manual_validation_remain_enabled(self):
        ci = (ROOT / ".github/workflows/ci.yml").read_text()
        events = ci.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertEqual(events, "  workflow_dispatch:\n  pull_request:\n  push:\n    branches:\n      - main\n")
        self.assertIn("permissions:\n  contents: read\n", ci)

    def test_reintroducing_a_deployer_or_credential_fails_review_contract(self):
        ci = (ROOT / ".github/workflows/ci.yml").read_text()
        for addition in ["\n  deploy:\n    runs-on: ubuntu-latest\n",
                         "\n    environment: production\n",
                         "\n    token: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n",
                         "\n    token: ${{ secrets['CLOUDFLARE_API_TOKEN'] }}\n",
                         "\n    token: ${{ secrets [ 'CLOUDFLARE_API_TOKEN' ] }}\n"]:
            with self.subTest(addition=addition), self.assertRaises(AssertionError):
                assert_validation_only(ci + addition)


if __name__ == "__main__":
    unittest.main()
