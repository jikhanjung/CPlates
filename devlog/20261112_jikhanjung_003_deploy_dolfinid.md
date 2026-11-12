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

## 재배포: 236fb99 (단면 A–A′ 쪽 추가)

2026-11-12, 사용자 직접 지시(이 세션): "다 되면 일단 배포해줘."

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과(새 단면 쪽 포함). 디스크 여유 25 GB.
- `deploy/deploy.sh 236fb99`: 112 MB, `current -> releases/236fb99`. 이전 f6b01c9와 cc9901d는 남겼다.
- 배포 뒤: https `/`, `/cambrian/`, `/section/`, 단면 자료와 새 JS 200. `version.json` 236fb99.
  earththrutime3d `/healthz` 200, cdgts 200. `tests/browser.mjs`를 https 주소에 대고 전체 통과.
- push는 하지 않았다(origin/main은 077c25b). 배포한 커밋은 아직 GitHub에 없다.

## 재배포: bb1afb1 (남극대륙만 3D, 작은 지구본, 섀클턴 석회암)

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘."

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과. 디스크 여유 25 GB.
- `deploy/deploy.sh bb1afb1`: 114 MB, `current -> releases/bb1afb1`(이전 236fb99, f6b01c9, cc9901d 남김).
- 배포 뒤: https `/`, `/cambrian/`, `/section/`, 새 자료(region.bin, shackleton.bin) 200. `version.json` bb1afb1.
  earththrutime3d `/healthz` 200, cdgts 200. `tests/browser.mjs`를 https 주소에 대고 전체 통과.
- push는 하지 않았다.

## 재배포: 2736d00 (자료 버전 붙이기, 지각 연속, 구멍 없앰) + nginx 캐시 설정

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘"

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과. 디스크 여유 25 GB.
- `deploy/deploy.sh 2736d00`: 114 MB, `current -> releases/2736d00`. 이전 릴리스는 남겼다.
- nginx: `sites-available/cplates`를 `deploy/nginx-cplates-tls.conf`로 바꿨다(백업
  `cplates.bak-20261112-cache`). `nginx -t` 통과 뒤 reload했고, cplates 설정만 바꿨다.
  - 쪽·JS·CSS는 `Cache-Control: no-cache`, `/data/`는 `public, max-age=3600`, `version.json`은 `no-store`.
  - reload 직후 잠깐은 옛 워커가 응답해 헤더가 없었고, 다시 확인해 적용을 확인했다.
- 배포 뒤: https `version.json` 2736d00. earththrutime3d 200, cdgts 200. http → https 301.
  `tests/browser.mjs`를 https 주소에 대고 전체 통과.

## 재배포: 6838391 (반투명 맨틀 암석권·맨틀, 3D 슬랩, 해구 위치 보간)

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘"

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과. 디스크 여유 25 GB.
- `deploy/deploy.sh 6838391`: 114 MB, `current -> releases/6838391`.
- 배포 뒤: https 쪽·코드 `no-cache` 헤더 유지, `version.json` 6838391, earththrutime3d 200, cdgts 200.
  `tests/browser.mjs`를 https 주소에 대고 전체 통과.
- 서버의 릴리스 디렉터리가 여섯 개(약 600 MB)로 늘었다. 오래된 릴리스를 지우는 규칙은 아직 없다.

## 재배포: 6d4a683 (해구선 점마다 보간, 작은 지구본 회전·크기)

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘"

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과. 디스크 여유 25 GB.
- `deploy/deploy.sh 6d4a683`: 114 MB, `current -> releases/6d4a683`.
- 배포 뒤: 쪽·코드 `no-cache`, `version.json` 6d4a683, earththrutime3d 200, cdgts 200. `tests/browser.mjs`를 https에 대고 전체 통과.

## 재배포: 7e49aca (상자 면 끌기로 단면 옮기기)

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘"

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과. `deploy/deploy.sh 7e49aca`: 114 MB, `current -> releases/7e49aca`.
- 배포 뒤: 쪽·코드 `no-cache`, `version.json` 7e49aca, earththrutime3d 200, cdgts 200. `tests/browser.mjs`를 https에 대고 전체 통과.

## 재배포: 25990e4 (작은 지구본 세로 회전 방향)

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘."

- 배포 전: `make test` 21개, 브라우저 점검 전체 통과. 디스크 여유 24 GB(릴리스 9개 남음).
- `deploy/deploy.sh 25990e4`: 114 MB, `current -> releases/25990e4`(이전 7e49aca).
- 배포 뒤: 쪽·코드 `no-cache`, `version.json` no-store 25990e4, 고친 `section.js`가 실려 있음.
  earththrutime `/healthz` 200, cdgts.paleobytes.info 200. `tests/browser.mjs`를 https에 대고 전체 통과
  (기준 주소는 끝에 `/`를 붙여야 한다: 빼면 `…infocambrian/`로 이어져 이름 풀이에 실패한다).

## 재배포: c417757 (상자 넓히기, 슬랩 자리 비우기, 해구–지형 어긋남 표시와 맞춤 보기, 가린 핸들 숨김)

2026-11-12, 사용자 직접 지시(이 세션): "배포해줘."

- 배포 전: node 시험 30개, 브라우저 점검 전체 통과. 단면 자료를 넓은 격자(213×117)로 다시 빌드했다. 디스크 여유 23 GB.
- `deploy/deploy.sh c417757`: 119 MB, `current -> releases/c417757`(이전 25990e4).
- 배포 뒤: `/`, `/section/`, `/cambrian/`, 새 JS(slabcut.js, trenchfit.js), 단면 자료 200, meta 213×117·box 확인,
  `version.json` c417757. 자료는 버전 꼬리표를 붙여 받으므로 1시간 캐시에 옛 격자가 남지 않는다.
  earththrutime 200, cdgts.paleobytes.info 200. `tests/browser.mjs`를 https에 대고 전체 통과.
