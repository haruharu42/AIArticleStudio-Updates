# AI Article Studio release process

Stable updates must not be published directly to `main` without validation.

1. Build a new immutable ZIP with a unique versioned filename. Never overwrite an existing ZIP URL.
2. Test ZIP integrity and Python syntax locally.
3. Calculate SHA256 from the final ZIP bytes.
4. Create a release-candidate branch containing the ZIP and manifest change.
5. Open a pull request to `main`.
6. Wait for **Validate update release** to pass on both Ubuntu and Windows PowerShell 5.1 jobs.
7. Merge only after all validation checks pass.
8. After merge, verify the stable manifest and package still match.

The validation workflow checks manifest structure, immutable HTTPS package URL, package existence, SHA256, ZIP central directory, unsafe ZIP paths, Python UTF-8/syntax, and Windows PowerShell 5.1 extraction. Non-ASCII inline `python -c` validation commands are rejected.

If validation fails, the candidate is not merged and users remain on the previous stable release.
