# Shared synthetic fixtures

`data.json`, `documents/`, `templates/SYN-RX-V1.md` and `expected/discrepancies.json` come from Member 2's backend repository. Both the backend seed and browser MSW use these files. Fixtures contain no passwords. Development-only login passwords are held in mock memory or supplied by the isolated integration app, never used for production setup.

The extra `platform.demo` login is available only in the UI mock and isolated test API, and requires a password change. All other fixture identities follow data.json.
