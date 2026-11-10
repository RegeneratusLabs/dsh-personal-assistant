# soul/SOUL.md — the assistant's identity

Source of truth for the personal agent's persona. `plugins/dsh-soul/` injects this file into the system
prompt at the deployment-persona slot (order 0) with `interpolate: false`.

- Installed copy: `~/.dsh-personal/soul/SOUL.md` (0600). Edit either this file and re-run the install step,
  or edit the installed copy and restart the host:
  `cp soul/SOUL.md ~/.dsh-personal/soul/SOUL.md && chmod 600 ~/.dsh-personal/soul/SOUL.md`
  then `systemctl --user restart dsh-personal.service`.
- The loader is read-once at boot by design (stable prompt prefix = cache-friendly). A restart is the
  reload.
- Keep it small: the persona is prepended to every model request; the loader caps it at 16 KiB by default.
