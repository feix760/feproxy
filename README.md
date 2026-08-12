
# FeProxy
[![NPM version](https://img.shields.io/npm/v/feproxy.svg?style=flat-square)](https://npmjs.org/package/feproxy)
[![node version](https://img.shields.io/badge/node.js-%3E=_16-green.svg?style=flat-square)](http://nodejs.org/download/)
[![build status](https://img.shields.io/github/actions/workflow/status/feix760/feproxy/ci.yml?branch=master&style=flat-square)](https://github.com/feix760/feproxy/actions/workflows/ci.yml)
[![Test coverage](https://codecov.io/gh/feix760/feproxy/branch/master/graph/badge.svg?style=flat-square)](https://codecov.io/gh/feix760/feproxy)
[![License](https://img.shields.io/npm/l/feproxy.svg?style=flat-square)](https://www.npmjs.com/package/feproxy)

**FeProxy** is a proxy tool use for web development like the `Fiddler`, and we use `Chrome Devtools` to inpect net traffic.

### Install

```sh
[sudo] npm install feproxy -g
```

### Usage

```sh
feproxy
```

It prints the two addresses you need:

```
👉 Proxy server http://192.168.1.5:8888
🚀 Inspect page http://192.168.1.5:8888/admin.html
```

1. Point your browser / phone / emulator at the proxy server (host + port, HTTP proxy).
2. Open the inspect page to watch traffic in Chrome DevTools' network panel and to edit forwarding rules.

To capture HTTPS, install FeProxy's root certificate on the client and trust it — open
`http://<host>:<port>/feproxy.crt` on the device (the cert also lives in `~/.feproxy`, named
`feproxy-<user>.crt`). Without it HTTPS still works, but only as an opaque tunnel.

### Options

```sh
feproxy [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `-p, --port` | `8888` | Service port |
| `--hostname` | `feproxy.org` | Hostname of FeProxy self site |
| `-c, --config` | `~/.feproxy` | Directory of config files |
| `--https` / `--no-https` | `true` | Decrypt (MITM) https requests so they can be captured and modified |
| `--ignore-cert-error` | `false` | Ignore upstream certificate errors |
| `--inspect` / `--no-inspect` | `true` | Push requests to devtools; `--no-inspect` forwards only |
| `--auth` / `--no-auth` | `false` | Enable proxy basic authentication |
| `--username` | `feproxy` | Username of proxy basic authentication |
| `--password` | `feproxy` | Password of proxy basic authentication |
| `-v, --version` | | Output the version number |
| `--help` | | Show help |

```sh
feproxy -p 8080                              # start on port 8080
feproxy --no-https                           # do not decrypt https requests
feproxy --no-inspect                         # forward only, no capturing
feproxy --auth --username me --password pwd   # require proxy credentials
```

Authentication applies to proxied traffic only — the inspect page, `/feproxy.crt` and the
other FeProxy endpoints stay open. Credentials cannot be changed from the inspect page.

### Rules

Rules live in projects, editable on the inspect page (settings button, bottom right) or in
`~/.feproxy/config.json`. Each rule matches `match` (a case-insensitive regexp) against the
full request URL and applies one action, written in the UI as a single `to` string:

| `to` | Effect |
| --- | --- |
| `http://127.0.0.1:3000/$1` | Forward the request to another URL |
| `host://127.0.0.1:3000` | Keep the URL, send it to this host/port |
| `file:///path/to/dist/$1` | Serve a local file |
| `status://404` | Reply with a status code (`status://302?location=...` to redirect) |
| `delay://1000` | Delay the request by N ms |
| `header://?cache-control=no-cache` | Override response headers |

`$1`, `$2`… are back-references to the capture groups of `match`. Rules of different types
stack (`delay` + `header` + a terminal `http`/`file`/`status`); for the same type only the
first match wins.

On the wire (and in `config.json`) a rule is `{ enable, match, type, param }`:

```json
{
  "projects": [
    {
      "name": "my-app",
      "enable": true,
      "rules": [
        { "enable": true, "match": "^https?://example\\.com/static/(.*)", "type": "file", "param": { "path": "/Users/me/app/dist/$1" } },
        { "enable": true, "match": "^https?://example\\.com/api/", "type": "delay", "param": { "delay": 1000 } }
      ]
    }
  ],
  "https": true,
  "ignoreCertError": false,
  "inspect": true
}
```

`config.json` is also where `https` / `ignoreCertError` / `inspect` are persisted when you
toggle them on the inspect page. Precedence is defaults ← `config.json` ← CLI options.

### Development

```sh
git clone https://github.com/feix760/feproxy.git
cd feproxy
npm run dev
```
