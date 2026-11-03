# Build and verification status

This archive is a source upgrade based on the MeshCode 0.1 scaffold. The package installation/build could not be verified in the preparation environment because npm dependency installation timed out. Run `npm install` and `npm run compile` locally before pressing F5 or packaging.

The implementation adds a file-backed append-only Yjs update store, reconnect attempts with exponential backoff, multiple client message subscribers, and basic file create/delete/rename relay. It is still an MVP and has not been validated with two physical computers. Read the README's limitations and security notes before using it beyond a trusted test LAN.
