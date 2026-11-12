# CPlates 배포 (dolfinid)

정적 사이트라 컨테이너도 데이터베이스도 없다. nginx가 파일을 바로 내보낸다.
dolfinid의 다른 서비스(Docker + nginx 프록시)와 달리 백업할 운영 자료가 없고, 모든 파일은
저장소의 커밋과 `make frames cambrian phanerozoic section`으로 다시 만들 수 있다.

- 주소: https://cplates.nopeoplestime.info (DNS A 레코드 → 34.64.158.160 필요)
- 호스트 배치:
  - `/srv/cplates/releases/<commit>/` — 배포마다 하나
  - `/srv/cplates/current -> releases/<commit>` — 원자적으로 바꿈
  - `/srv/cplates/acme/` — certbot webroot
  - `/srv/cplates/deploys.log` — 배포 기록
- nginx: `/etc/nginx/sites-available/cplates`(+ sites-enabled 링크). 1단계는 `nginx-cplates.conf`
  (HTTP, ACME), 인증서를 받은 뒤 2단계 `nginx-cplates-tls.conf`(80 → 443).

## 배포

규칙(devdocs guides/web/deployment.md §10–11, 2026-11-12 사용자 결정):
- GitHub main에 있는 커밋만 배포한다. `deploy.sh`가 먼저 `git fetch`와 `git merge-base --is-ancestor`로
  확인하고, 아니면 멈춘다. "배포해줘"만 있고 push 이야기가 없으면 push가 먼저 필요하다고 알리고 답을 받는다.
- `deploy.sh`는 바꿔 끼운 뒤 https로 스모크(쪽 200, `version.json`이 그 커밋)를 하고, 통과하면
  `deploy/prune.sh`로 이전 릴리스를 지금 것 + 2개만 남긴다(`CPLATES_PRUNE=0`이면 건너뜀).
  `deploy/prune.sh --dry-run`으로 지울 목록만 볼 수 있다.

```sh
make test                                   # node 시험
make serve & make browser                   # 로컬 브라우저 점검
git push origin main                        # 배포할 커밋이 main에 있어야 함
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

## DNS가 풀린 뒤 (2026-11-12에 함)

```sh
dig +short cplates.nopeoplestime.info        # 34.64.158.160 이어야 함
ssh dolfinid 'sudo certbot certonly --webroot -w /srv/cplates/acme -d cplates.nopeoplestime.info'
scp deploy/nginx-cplates-tls.conf dolfinid:/tmp/cplates.nginx
ssh dolfinid 'sudo install -m 644 /tmp/cplates.nginx /etc/nginx/sites-available/cplates &&
  sudo nginx -t && sudo systemctl reload nginx'
curl -sI https://cplates.nopeoplestime.info/ | head -1
# 갱신 뒤 nginx가 새 인증서를 읽도록 (earththrutime3d와 같은 훅)
ssh dolfinid 'sudo certbot reconfigure --cert-name cplates.nopeoplestime.info --deploy-hook "nginx -t && systemctl reload nginx"'
ssh dolfinid 'sudo certbot renew --cert-name cplates.nopeoplestime.info --dry-run'
```

HTTP 단계 설정은 `/etc/nginx/sites-available/cplates.bak-http-20261112`에 남겨 두었다(sites-enabled에는 없음).
