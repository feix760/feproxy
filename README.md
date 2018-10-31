
FeProxy is a proxy tool use for web development like the `Fiddler`, and we use `Chrome Devtools` to inpect net traffic.

- Inpect net traffic to chrome

[![inspect page](https://raw.githubusercontent.com/feix760/feproxy/master/docs/inspector.png)](http://127.0.0.1:8100/inspect)

- Map url to file, other url, other host

[![manage page](https://raw.githubusercontent.com/feix760/feproxy/master/docs/manage.png)](http://127.0.0.1:8100/inspect)

### Install

```sh
[sudo] npm install feproxy -g
```

### Usage

```sh
feproxy
```

Server start on http://127.0.0.1:8080

Manage page on [http://127.0.0.1:8080/admin.html](http://127.0.0.1:8080/admin.html)

### Development

```sh
git clone https://github.com/feix760/feproxy.git
cd feproxy
npm run dev
```

### Manage

`Rule`:

^http://qqweb\\.qq\\.com/m/qunactivity/(.*)$ file://Users/yuan/works/qunactivity_mobile/src/$1

offline\\.zip status://404

`Host`:

s.url.cn 10.70.65.110
