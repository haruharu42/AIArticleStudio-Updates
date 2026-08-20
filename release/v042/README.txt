AI Article Studio v0.4.2 - Phase 3.6 Image Workflow

Changes:
- Beginner-friendly image-generation settings UI
- Web-mode eyecatch prompt generation
- Illustration marker parsing and per-illustration prompt generation
- Illustration summary output
- Article-linked image metadata sidecar storage
- Safe GPU diagnostics without requiring PyTorch/CUDA packages
- Legacy-safe workflow-state schema v2

Current direct-generation status:
- Web mode: available through generated prompts and browser workflow
- API direct image generation: not enabled in this release
- Local GPU direct image generation: not enabled in this release; diagnostics only

Requirement:
- AI Article Studio v0.4.1

Safety:
- Canonical installed files are checked directly; backup_auto_* folders are not scanned as update targets.
- Image feature defaults OFF, so existing article generation remains unchanged unless the user enables it.
