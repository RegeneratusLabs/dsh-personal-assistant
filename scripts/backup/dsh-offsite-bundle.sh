#!/usr/bin/env bash
# dsh-offsite-bundle.sh — encrypt a backup directory for off-host storage (M2).
#
# `dsh-backup.sh` produces a local plaintext backup that contains `.credentials.yaml`. This wrapper
# turns one finished backup into a single AES-256 encrypted archive plus a checksum, so the copy that
# leaves the host is safe to store elsewhere. It never deletes or modifies the plaintext backup.
#
# Usage:
#   scripts/backup/dsh-offsite-bundle.sh [--backup DIR] [--out DIR] [--passphrase-file FILE]
#                                        [--recipient GPG-ID] [--keep-plain]
#   --backup             backup dir (default: newest under ~/backups/dsh-personal/daily)
#   --out                output dir (default: ~/backups/offsite)
#   --passphrase-file    0600 file whose first line is the passphrase (symmetric, default)
#   --recipient          encrypt to an existing GPG public key instead of symmetric
#   --keep-plain         keep the intermediate .tar.gz (default: remove it)
# Exit: 0 ok, 1 backup/encrypt/verify failure, 2 usage/guard.
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/dsh-personal}"
BACKUP_DIR=""
OUT_DIR="$HOME/backups/offsite"
PASS_FILE=""
RECIPIENT=""
KEEP_PLAIN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup) BACKUP_DIR="${2:?}"; shift 2 ;;
    --out) OUT_DIR="${2:?}"; shift 2 ;;
    --passphrase-file) PASS_FILE="${2:?}"; shift 2 ;;
    --recipient) RECIPIENT="${2:?}"; shift 2 ;;
    --keep-plain) KEEP_PLAIN=1; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v gpg >/dev/null 2>&1 || { echo "ERROR: gpg is required" >&2; exit 2; }

if [[ -z "$BACKUP_DIR" ]]; then
  BACKUP_DIR="$(find "$BACKUP_ROOT/daily" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort | tail -1)"
fi
[[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]] || { echo "ERROR: no backup dir (looked under $BACKUP_ROOT/daily)" >&2; exit 2; }
[[ -f "$BACKUP_DIR/manifest.json" ]] || { echo "ERROR: $BACKUP_DIR does not look like a dsh backup (no manifest.json)" >&2; exit 2; }

if [[ -n "$PASS_FILE" ]]; then
  [[ -f "$PASS_FILE" ]] || { echo "ERROR: passphrase file not found: $PASS_FILE" >&2; exit 2; }
  mode="$(stat -c %a "$PASS_FILE")"
  case "$mode" in 600|400) ;; *) echo "REFUSED: passphrase file must be 0600/0400 (is $mode)" >&2; exit 2 ;; esac
elif [[ -z "$RECIPIENT" ]]; then
  echo "ERROR: pass --passphrase-file (symmetric) or --recipient <gpg-key> (asymmetric)" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
stamp="$(basename "$BACKUP_DIR")"
plain="$OUT_DIR/dsh-personal-$stamp.tar.gz"
enc="$plain.gpg"
[[ -e "$enc" ]] && { echo "ERROR: refusing to overwrite $enc" >&2; exit 1; }

echo "backup : $BACKUP_DIR"
echo "output : $enc"

# Plaintext intermediate: 0600 inside a 0700 dir; removed unless --keep-plain.
tar -C "$BACKUP_DIR" -czf "$plain" .
chmod 600 "$plain"

gpg_args=(--batch --yes --quiet --cipher-algo AES256 --compress-algo none
          --output "$enc" --pinentry-mode loopback)
if [[ -n "$RECIPIENT" ]]; then
  gpg_args+=(--trust-model always --recipient "$RECIPIENT" --encrypt)
  [[ -n "$PASS_FILE" ]] && echo "(note: both --passphrase-file and --recipient given; using the recipient)" >&2
else
  gpg_args+=(--symmetric --passphrase-file "$PASS_FILE")
fi
gpg "${gpg_args[@]}" "$plain"
chmod 600 "$enc"

# Verify by decrypting the stream and listing the tar (no extraction to disk).
if [[ -n "$RECIPIENT" && -z "$PASS_FILE" ]]; then
  gpg --batch --quiet --decrypt "$enc" 2>/dev/null | tar -tzf - >/dev/null
else
  gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE" --decrypt "$enc" 2>/dev/null | tar -tzf - >/dev/null
fi
sha="$(sha256sum "$enc" | cut -d' ' -f1)"
printf '%s  %s\n' "$sha" "$(basename "$enc")" > "$enc.sha256"
chmod 600 "$enc.sha256"

[[ "$KEEP_PLAIN" -eq 1 ]] || rm -f "$plain"
echo "encrypted : $(numfmt --to=iec "$(stat -c %s "$enc")")"
echo "sha256    : $sha"
echo
echo "Next (off-host): copy BOTH files to your remote, e.g."
echo "  scp \"$enc\" \"$enc.sha256\" <remote>:<path>/"
echo "Restore: gpg --decrypt <file>.gpg | tar -xzf - -C <empty-dir>  (or use gpg --output)"
