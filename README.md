# web_infra-RateDesk
# RateDesk: currency converter and rate tracker

RateDesk helps students (and anyone sending or receiving money abroad) see what their money is worth. It converts between currencies, lists every rate with search, sort and favourites, and draws a 30-day, 90-day or 1-year trend so you can decide whether today is a good day to exchange.

- **Live site (through the load balancer):** https://www.mwayo.tech/ratedesk/
- **Demo video (under 2 minutes):** `ADD YOUR VIDEO LINK HERE`
- **Repository:** https://github.com/mwayo-tech/ratedesk

> **API keys and logins:** none. RateDesk uses a public API that needs no key, and the app has no accounts or login. Nothing secret exists in this repository.

## Features

| Area | What it does |
|---|---|
| Converter | Amount, from, to, swap button. Updates as you type. Validates input (empty, letters, zero, negative, too large). |
| Rates table | All rates for a chosen base currency. **Search** by code or name, **sort** by code, name or rate, **filter** to favourites only. |
| Favourites | Star currencies; saved in your browser. |
| Trend chart | 30 days, 90 days or 1 year for the selected pair, with high, low and percentage change in plain words. Hover or use the arrow keys to read individual days. |
| Error handling | Timeouts, no network, bad responses and API error messages all show a clear banner with a **Try again** button. If a saved copy exists, it is shown and labelled with its age. |
| Caching | Responses are cached in the browser (30 min for rates, 6 h for history, 24 h for the currency list), so the app is fast and keeps working briefly offline. |
| Accessibility | Labelled controls, keyboard-friendly chart, live status messages, visible focus, light and dark themes, reduced-motion support. |
| Load balancer badge | Footer shows which web server answered (from the `X-Served-By` header), so balancing is easy to see. |

## API used

**[Frankfurter](https://frankfurter.dev)** (v1 endpoints). Free, no API key, backed by European Central Bank reference rates. Official docs: https://frankfurter.dev and https://frankfurter.dev/v1/

Endpoints used:

| Purpose | Request |
|---|---|
| Currency names | `GET https://api.frankfurter.dev/v1/currencies` |
| Latest rates | `GET https://api.frankfurter.dev/v1/latest?base=USD` |
| History | `GET https://api.frankfurter.dev/v1/2026-10-24..2026-11-23?base=USD&symbols=EUR` |

Rates are reference rates for information. They are not live trading quotes and your bank's rate will differ.

## Run it locally

No build step and no dependencies.

**Option 1: open the file.** Double-click `index.html`.

**Option 2: a local server** (recommended, closer to production):

```bash
# from the project folder
python3 -m http.server 8080      # or: python -m http.server 8080 on Windows
# then open http://localhost:8080
```

## Project structure

```
index.html        page structure
css/styles.css    layout, themes, responsive rules
js/api.js         Frankfurter requests, timeouts, caching, error types
js/chart.js       dependency-free SVG chart
js/app.js         converter, table, favourites, wiring
deploy/           deploy.sh (bash) and deploy.ps1 (PowerShell)
docs/             demo video script
```

## Deploy to the web servers

The app is static, so nginx serves it directly. It goes in `/var/www/html/ratedesk/` on **both** web servers, so the existing `/` page and custom 404 page from earlier projects keep working.

Servers used:

| Role | Hostname | IP |
|---|---|---|
| Web server 1 | `web-01.mwayo.tech` | 18.171.60.133 |
| Web server 2 | `web-02.mwayo.tech` | 18.133.244.50 |
| Load balancer | `lb-01.mwayo.tech` (`www.mwayo.tech`) | 18.171.58.46 |

Both web servers already run nginx with the header `add_header X-Served-By $hostname;` so you can tell them apart.

**Windows (PowerShell), from the project folder:**

```powershell
.\deploy\deploy.ps1 -Key $env:USERPROFILE\.ssh\school -Web01 18.171.60.133 -Web02 18.133.244.50
```

**Linux, macOS or WSL:**

```bash
./deploy/deploy.sh ~/.ssh/school 18.171.60.133 18.133.244.50
```

Each script copies `index.html`, `css/` and `js/` to the server, installs them into `/var/www/html/ratedesk/`, and prints the HTTP status of `http://<ip>/ratedesk/` (expect `200`).

Manual equivalent for one server:

```bash
scp -i ~/.ssh/school -r index.html css js ubuntu@18.171.60.133:~/ratedesk_upload/
ssh -i ~/.ssh/school ubuntu@18.171.60.133
sudo mkdir -p /var/www/html/ratedesk && sudo cp -r ~/ratedesk_upload/* /var/www/html/ratedesk/
```

Repeat for web-02. Any later change must be deployed to **both** servers, or users will see different versions depending on which server answers.

## Load balancer configuration (HAProxy)

HAProxy on `lb-01` terminates HTTPS (Let's Encrypt certificate for `www.mwayo.tech`), redirects HTTP to HTTPS, and distributes requests across both web servers with **round robin**. Relevant part of `/etc/haproxy/haproxy.cfg`:

```
frontend http_front
	bind *:80
	mode http
	http-request redirect scheme https code 301 unless { ssl_fc }
	default_backend web_servers

frontend https_front
	bind *:443 ssl crt /etc/haproxy/certs/www.mwayo.tech.pem
	mode http
	http-request set-header X-Forwarded-Proto https
	default_backend web_servers

backend web_servers
	mode http
	balance roundrobin
	server web-01 18.171.60.133:80 check
	server web-02 18.133.244.50:80 check
```

`check` makes HAProxy stop sending traffic to a server that is down, so users keep getting answers from the healthy one.

## Test that traffic is balanced

Each request should alternate between the two servers. From PowerShell:

```powershell
1..6 | ForEach-Object { curl.exe -sI https://www.mwayo.tech/ratedesk/ | Select-String -Pattern "x-served-by" }
```

Expected: `x-served-by` alternating between `...-web-01` and `...-web-02`. The footer of the page shows the same value; reload to see it change.

Check each server directly:

```powershell
curl.exe -sI http://18.171.60.133/ratedesk/
curl.exe -sI http://18.133.244.50/ratedesk/
```

Failover test: stop nginx on web-01 (`sudo service nginx stop`), reload the site several times (every response now comes from web-02), then start it again.

## Challenges and how I solved them

- **Which API version to trust.** The newer Frankfurter docs (v2) do not show response examples, while the v1 endpoints are documented as staying available. I built against v1 and validate every response before using it, so an unexpected shape shows a clear message instead of a blank screen.
- **A flaky network must not break the app.** I added request timeouts, a cache with a time limit, and a fallback to the last saved copy that is clearly labelled as old.
- **Out-of-order responses.** Typing quickly or switching currencies can make a slow, older request finish after a newer one. Each request carries a token, and stale results are ignored.
- **Deploying without breaking earlier work.** The servers already serve the project index page and a custom 404 page that earlier checkers rely on, so the app lives under `/ratedesk/` instead of overwriting `index.html`.
- **DNS caching.** After adding the `www` record, the load balancer's own resolver kept answering "not found" for a while because it had cached the earlier failure. Querying the authoritative nameserver directly (`dig www.mwayo.tech @ns1.dns.host`) proved the record was correct while the cache expired.

## Credits

- Exchange rate data: **[Frankfurter](https://frankfurter.dev)**, which republishes European Central Bank reference rates.
- No third-party JavaScript libraries are used. The chart is hand-written SVG.
- Infrastructure: nginx, HAProxy and Let's Encrypt (certbot).

## Licence

Educational project. Exchange rates are provided by Frankfurter and are subject to its terms.
