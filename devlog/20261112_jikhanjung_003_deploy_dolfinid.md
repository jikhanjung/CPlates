# jikhanjung 003 — dolfinid 첫 배포 (cc9901d), HTTPS까지

2026-11-12. 사용자 직접 지시(반장 세션 전달): "dolfinid 에 배포해줘", 주소 cplates.nopeoplestime.info.
대상은 "남극 따라가기" 수정 뒤의 main, `cc9901d`.

## 방식

dolfinid의 다른 서비스는 모두 컨테이너 + nginx 프록시(earththrutime3d 8014, cdgts 8011 등)다.
CPlates는 서버 코드도 DB도 없는 정적 사이트라 컨테이너 없이 nginx가 파일을 바로 내보낸다.
릴리스 디렉터리와 `current` 링크로 배포·되돌리기를 하고, 80 포트의 ACME 경로는 earththrutime3d와
같은 꼴이다. 절차와 명령은 [deploy/README.md](../deploy/README.md).

## 한 일 (관측)

- 배포 전: `make test` 14개 통과, 로컬 브라우저 점검 통과(cc9901d).
- `/srv/cplates` 생성(honestjung 소유), `deploy/deploy.sh cc9901d`: 36 MB. 0–250 Ma 프레임 251개와
  캄브리아기 자료를 모두 넣었다. `current -> releases/cc9901d`, `version.json`에 커밋 기록.
- nginx: `sites-available/cplates`(HTTP 단계) 추가, sites-enabled 링크. `nginx -t` 성공(경고는 다른
  사이트의 기존 설정에서 나온 것) 뒤 reload. 다른 사이트 설정은 건드리지 않았다.
- 서버 안 확인(`Host: cplates.nopeoplestime.info`, 127.0.0.1): 쪽·JS·벤더·CSS·자료·PNG 13개 경로 200,
  MIME 맞음, 없는 경로 404, gzip 동작(continents.json 2.2 MB → 0.88 MB).
- reload 뒤 earththrutime3d `/healthz` 200, cdgts 200.
- 실제 브라우저: `CPLATES_RESOLVE`로 이름을 34.64.158.160에 묶어 `tests/browser.mjs` 전체를 서버에 대고
  돌려 통과(메인, 캄브리아기, 따라가기 중심, 휴대폰 폭).

## 1단계 때의 남은 일 (2단계에서 끝냄)

1. **DNS**: 사용자가 `cplates.nopeoplestime.info` A 레코드 → 34.64.158.160을 추가해야 한다. 지금은
   `*.nopeoplestime.info` 와일드카드가 WordPress(192.0.78.24/25)로 간다.
2. DNS가 풀리면 `certbot certonly --webroot -w /srv/cplates/acme -d cplates.nopeoplestime.info`, 그다음
   `nginx-cplates-tls.conf`로 바꾸고 `nginx -t` 뒤 reload(80 → 443).
3. 배포 도구(`deploy/`)와 이 기록은 cc9901d 다음 커밋이다. 배포한 `site/`는 cc9901d와 같다.

## 2단계: 인증서와 HTTPS (같은 날, 사용자가 DNS A 레코드 추가)

- DNS: 1.1.1.1, 8.8.8.8, dolfinid 모두 34.64.158.160(관측). m710q 로컬 리졸버는 예전 와일드카드 캐시라 쓰지 않았다.
- `certbot certonly --webroot -w /srv/cplates/acme -d cplates.nopeoplestime.info`: 성공, Let's Encrypt YE2,
  2026-11-11 23:43 – **2027-02-09 23:43 UTC**.
- `nginx-cplates-tls.conf`로 바꿈(HTTP 설정은 `cplates.bak-http-20261112`로 남김) → `nginx -t` 성공 → reload.
- 갱신: snap certbot 타이머가 돈다. 새 인증서의 갱신 설정에는 nginx reload 훅이 없어서, earththrutime3d와 같은
  `renew_hook = nginx -t && systemctl reload nginx`를 `certbot reconfigure`로 넣었다. `certbot renew --dry-run` 성공.
- 확인: https 메인·/cambrian/·version.json·자료 200, `http://…/cambrian/?age=520` → 301 `https://…/cambrian/?age=520`,
  earththrutime3d `/healthz` 200, cdgts 200. `tests/browser.mjs`를 https 주소에 대고 전체 통과
  (스크린샷 `test-results/deployed-https/`, git 밖).

남은 일: 없음(배포 완료). push는 하지 않았다.

## 재배포: f6b01c9 (현생누대, 기준틀 전환, 메인 지구본 위치)

2026-11-12, 사용자 직접 지시(반장 전달): "다 해줘." (메인 지구본 위치 수정 → GitHub push → 재배포)

- 메인 지구본 위치: 캄브리아기 쪽과 같은 방식으로, 정보 칸·시간 막대를 뺀 영역 가운데에 맞추고 크기를
  맞췄다. `tests/browser.mjs`가 데스크톱·랩톱·휴대폰 크기에서, 점을 고른 뒤에도 중심(±3%)과 크기를 확인한다(f6b01c9).
- push: push 전에 기록 전체에서 큰 파일(가장 큰 것은 벤더 three.core.js 1.5 MB), `data/`·`site/data/`, 비밀값
  꼴의 문자열이 없음을 확인했다. 서버 이름·사용자 이름·호스트 이름은 EarthThruTime3D 공개 저장소와 같은
  수준으로만 들어 있다. `origin/main` 6820513 → f6b01c9 (빨리 감기).
- 배포 전: `make test` 16개, 브라우저 점검 전체 통과. dolfinid 디스크 여유 25 GB.
- `deploy/deploy.sh f6b01c9`: 110 MB, `current -> releases/f6b01c9`(이전 cc9901d는 되돌리기용으로 남김).
- 배포 뒤: https 메인·/cambrian/·두 모델의 자료·JS 200, `version.json` f6b01c9, http → https 301(질의 유지),
  인증서 만료 2027-02-09, earththrutime3d `/healthz` 200, cdgts 200. `tests/browser.mjs`를 https 주소에 대고 전체 통과.
