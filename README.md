# EnvAtlas

**See the environment-variable contract your repository actually has.**

EnvAtlas builds a value-blind inventory from example env files, application
code, shell scripts, Dockerfiles, and Compose interpolation. It then catches
the two quiet forms of configuration drift:

- code references a variable that no example file documents;
- an example variable no scanned runtime surface uses anymore.

It never reads the process environment and never includes values in output.

```text
$ npx github:0xacee/envatlas check
EnvAtlas mapped 6 variables across 4 files.

ERROR E001  DATABASE_POOL_SIZE
  referenced at src/db.js:8 but absent from every catalog

WARN  W001  LEGACY_API_URL
  catalogued at .env.example:12 but not referenced

1 error, 1 warning
```

## Why another env tool?

Schema validators answer “is this value valid?” EnvAtlas answers an earlier
repository question: “do all of the places that describe and consume our
configuration still agree?” It complements runtime validation rather than
replacing it.

## Quick start

Node.js 20 or newer is the only requirement.

```bash
# Run directly from GitHub
npx github:0xacee/envatlas check

# Save an explicit, reviewable policy
npx github:0xacee/envatlas init
npx github:0xacee/envatlas check --strict

# Machine-readable CI output
npx github:0xacee/envatlas check --format json
```

By default EnvAtlas discovers `.env.example`, `.env.sample`, and files ending
in `.env.example` as catalogs. It scans supported source files while ignoring
`.git`, dependencies, build output, and common cache directories.

## Configuration

`.envatlas.json` is optional:

```json
{
  "$schema": "https://raw.githubusercontent.com/0xacee/envatlas/main/schemas/config.schema.json",
  "catalogs": [".env.example", "apps/web/.env.example"],
  "include": ["apps/**", "compose*.yml", "scripts/**"],
  "exclude": ["**/fixtures/**", "**/generated/**"],
  "ignore": ["CI", "NODE_ENV", "GITHUB_*"],
  "allowUnused": ["OPTIONAL_*" ]
}
```

Patterns use `/` separators. `*` stays within one path segment and `**`
crosses directories. Explicit catalogs are always scanned even when they do
not match `include`.

## Detectors

| Surface | Recognized forms |
| --- | --- |
| dotenv catalog | `NAME=value`, `export NAME=value` |
| JavaScript / TypeScript | `process.env.NAME`, `import.meta.env.NAME` |
| Python | `os.getenv("NAME")`, `os.environ["NAME"]` |
| POSIX shell | `$NAME`, `${NAME}`, `${NAME:-default}` |
| Compose / YAML | `${NAME}` interpolation |
| Dockerfile | `ARG NAME`, `$NAME`, `${NAME}` |

Dynamic lookups such as `process.env[name]` cannot be inventoried statically.
Use `ignore` for runtime-provided variables and `allowUnused` for public knobs
consumed outside the repository.

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | no errors (and no warnings in `--strict` mode) |
| `1` | contract drift found |
| `2` | usage, configuration, or I/O error |

## CI

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npx github:0xacee/envatlas check --strict
```

## Design boundaries

- No dependencies, telemetry, network calls, or secret-value collection.
- Static inventory is evidence of references, not proof of runtime reachability.
- EnvAtlas intentionally does not validate types or secret strength.

## License

MIT
