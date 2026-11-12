# CPlates 배포 (dolfinid)

정적 사이트라 컨테이너도 데이터베이스도 없다. nginx가 파일을 바로 내보낸다.
dolfinid의 다른 서비스(Docker + nginx 프록시)와 달리 백업할 운영 자료가 없고, 모든 파일은
저장소의 커밋과 `make frames cambrian`으로 다시 만들 수 있다.

- 주소: https://cplates.nopeoplestime.info (DNS A 레코드 → 34.64.158.160 필요)
- 호스트 배치:
  - `/srv/cplates/releases/<commit>/` — 배포마다 하나
  - `/srv/cplates/current -> releases/<commit>` — 원자적으로 바꿈
  - `/srv/cplates/acme/` — certbot webroot
  - `/srv/cplates/deploys.log` — 배포 기록
- nginx: `/etc/nginx/sites-available/cplates`(+ sites-enabled 링크). 1단계는 `nginx-cplates.conf`
  (HTTP, ACME), 인증서를 받은 뒤 2단계 `nginx-cplates-tls.conf`(80 → 443).

## 배포

```sh
make test                                   # node 시험
make serve & make browser                   # 로컬 브라우저 점검
deploy/deploy.sh <commit>                   # site/가 그 커밋과 같고 site/data가 있어야 함
# 서버 안 확인 (DNS 전)
ssh dolfinid 'curl -s -H "Host: cplates.nopeoplestime.info" http://127.0.0.1/version.json'
# 실제 브라우저로 서버 확인 (DNS 전에도 됨)
CPLATES_RESOLVE="cplates.nopeoplestime.info 34.64.158.160" node tests/browser.mjs http://cplates.nopeoplestime.info/
```

되돌리기: `ssh dolfinid 'ln -sfn releases/<이전커밋> /srv/cplates/current.new && mv -T /srv/cplates/current.new /srv/cplates/current'`

## 처음 한 번 (2026-11-12에 함)

```sh
ssh dolfinid 'sudo mkdir /srv/cplates && sudo chown honestjung:honestjung /srv/cplates'
scp deploy/nginx-cplates.conf dolfinid:/tmp/cplates.nginx
ssh dolfinid 'sudo install -m 644 /tmp/cplates.nginx /etc/nginx/sites-available/cplates &&
  sudo ln -s /etc/nginx/sites-available/cplates /etc/nginx/sites-enabled/cplates &&
  sudo nginx -t && sudo systemctl reload nginx'
```

## DNS가 풀린 뒤 (남은 일)

```sh
dig +short cplates.nopeoplestime.info        # 34.64.158.160 이어야 함
ssh dolfinid 'sudo certbot certonly --webroot -w /srv/cplates/acme -d cplates.nopeoplestime.info'
scp deploy/nginx-cplates-tls.conf dolfinid:/tmp/cplates.nginx
ssh dolfinid 'sudo install -m 644 /tmp/cplates.nginx /etc/nginx/sites-available/cplates &&
  sudo nginx -t && sudo systemctl reload nginx'
curl -sI https://cplates.nopeoplestime.info/ | head -1
```
