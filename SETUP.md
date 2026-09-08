# Development Environment Setup & Authentication

This document explains how to set up authentication for write access to the GitHub repository.

## Current Setup (Windows Credential Manager)

The project currently uses **Windows Credential Manager** for GitHub authentication:

1. **Credential Helper**: Git is configured with `credential.helper = manager`
2. **No PAT needed**: Authentication happens automatically via stored credentials
3. **HTTPS remote**: `https://github.com/jacobhill93/chessapp.git`

## Verifying Write Access

To confirm you have write access to the repository:

```bash
# Navigate to the repository
cd C:\chessapp-review\chessapp

# Check remote configuration
git remote -v

# Test push access (dry-run only - creates no remote branch)
git branch test-write-access HEAD
git push origin test-write-access --dry-run
git branch -d test-write-access

# View available remote branches
git ls-remote origin
```

Expected output:
- No authentication prompts
- `* [new branch] test-write-access -> test-write-access` message (dry-run)
- List of existing branches (`claude/chess-training-stockfish-0yn0tt`, etc.)

## If Authentication Fails

If you encounter authentication errors:

### Option 1: Re-authenticate with Windows Credential Manager
```bash
# Clear existing credentials
git credential-manager reject https://github.com

# Re-authenticate (will prompt for credentials)
git credential-manager fill https://github.com
```

### Option 2: Use SSH Authentication (alternative)
```bash
# Generate SSH key (if not exists)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add SSH key to GitHub account
# Copy public key to clipboard
clip < ~/.ssh/id_ed25519.pub
# Then add to GitHub: Settings → SSH and GPG keys

# Change remote to SSH
git remote set-url origin git@github.com:jacobhill93/chessapp.git
```

### Option 3: Use Personal Access Token (PAT)
```bash
# Create PAT on GitHub with 'repo' scope
# Then configure git to use PAT:
git config credential.helper store
git remote set-url origin https://github.com/jacobhill93/chessapp.git
# Next push will prompt for username/PAT
```

## Recommended Workflow for AI Assistants

1. **Clone the repository**:
   ```bash
   git clone https://github.com/jacobhill93/chessapp.git
   ```

2. **Verify authentication** using the dry-run test above.

3. **Create feature branches** from `claude/chess-training-stockfish-0yn0tt`:
   ```bash
   git checkout claude/chess-training-stockfish-0yn0tt
   git checkout -b feature/your-feature-name
   ```

4. **Push changes**:
   ```bash
   git push origin feature/your-feature-name
   ```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `fatal: could not create work tree dir` | Check directory permissions. Use `C:\chessapp-review\` or another writable location. |
| `Permission denied` on push | Re-authenticate with Windows Credential Manager or use SSH/PAT. |
| `remote: Permission to jacobhill93/chessapp.git denied` | Ensure you have write permissions on the repository. |
| Network egress blocked for chess.com API | Requires new Claude session with updated network policy. Test with `curl -A "ChessTrainingApp/0.1" "https://api.chess.com/pub/player/jph093/games/archives"` |

## Environment Notes

- **Working Directory**: The environment defaults to `C:\Windows\system32`. Use absolute paths or `cd` to repository location.
- **Git Version**: 2.55.0.windows.5
- **PowerShell**: Windows PowerShell 5.1

---

*Last updated: 2026-09-07*