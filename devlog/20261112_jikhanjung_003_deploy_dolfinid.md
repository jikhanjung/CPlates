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

## 재배포: 259cb61 (스케일바, 새 배포 흐름) — 첫 push 선행 배포와 첫 릴리스 정리

2026-11-12, 사용자 직접 지시(banjang 전달): "push 배포 모두 진행해줘." (로컬 커밋 push, 첫 정리 때 이전 릴리스 7개 삭제 승인)

- 새 배포 흐름(devdocs guides/web/deployment.md §10–11): main에 있는 커밋만 배포, https 스모크 뒤 이전 릴리스는
  지금 것 + 2개.
- push 전 점검: 6커밋 15파일, 200 KB 넘는 파일·생성 자료·비밀값 없음. node 시험 30개 통과. `09dfb7a..259cb61` push.
- `CPLATES_PRUNE=0 deploy/deploy.sh 259cb61`: origin/main 확인 → 119 MB → `current -> releases/259cb61`(이전 c417757)
  → 스모크 통과(쪽 200, `version.json` 259cb61).
- 정리: 새 릴리스가 생겨 "지금 것 + 2"로는 승인 목록에 없던 7e49aca까지 8개가 지워지므로, 이번에는 승인된 7개만
  지웠다(`CPLATES_KEEP=3 deploy/prune.sh`, 지우기 전 current가 259cb61인지 확인). 지운 것: 6d4a683 6838391 2736d00
  bb1afb1 236fb99 f6b01c9 cc9901d. 남은 것: 259cb61(current) c417757 25990e4 7e49aca, 465 MB. 7e49aca는 다음
  배포의 정리에서 빠진다.
- 배포 뒤: `tests/browser.mjs`를 https에 대고 전체 통과. earththrutime `/healthz` 200, earththrutime·cdgts.paleobytes.info
  200. 디스크 여유 24 GB.

## 재배포: b2e6765 (석회암 설명 위치, 석회암 이름표를 분포 지역 위에)

2026-11-12, 사용자 직접 지시(이 세션): "일단 push 배포 하고".

- push 전 점검: 1커밋 3파일, 비밀값 없음. node 시험 30개 통과. `e3ca059..b2e6765` push.
- `deploy/deploy.sh b2e6765`: origin/main 확인 → `current -> releases/b2e6765`(이전 259cb61) → 스모크 통과 →
  정리(지금 것 + 2): 25990e4, 7e49aca 삭제. 남은 것 b2e6765 259cb61 c417757. 디스크 여유 24 GB.
- 배포 뒤: `tests/browser.mjs`를 https에 대고 전체 통과. earththrutime3d `/healthz` 200, cdgts 200.

## 재배포: f668ec3 (버드층군 노두, Myrow 2002 개정 층서로 다시 그린 기록 그림)

2026-11-12, 사용자 직접 지시(이 세션): "진행하자." (push·배포 물음에 대한 답)

- push 전 점검: 2커밋 9파일, 200 KB 넘는 파일·생성 자료·비밀값·그림 파일 없음(Myrow 2002 그림은 저장소 밖).
  node 시험 30개 통과. 단면 자료를 노두·새 지층 자료로 다시 빌드했다. `1a816b2..f668ec3` push.
- `deploy/deploy.sh f668ec3`: origin/main 확인 → `current -> releases/f668ec3`(이전 b2e6765) → 스모크 통과 →
  정리로 c417757 삭제. 남은 것 f668ec3 b2e6765 259cb61. 디스크 여유 24 GB.
- 배포 뒤: 운영 meta에 노두 윤곽 6개와 새 지층(goldie 포함) 확인. `tests/browser.mjs`를 https에 대고 전체 통과.
  earththrutime3d `/healthz` 200, cdgts 200.

## 재배포: 0db5733 (버드층군 노두를 GeoMAP으로, 현생누대의 남극대륙 새 페이지)

2026-11-13, 사용자 직접 지시(이 세션): "진행해줘. 다음 작업도 계속." (push·배포 물음에 대한 답)

- push 전 점검: 2커밋 21파일, 가장 큰 파일 `byrd_outcrops.json` 143 KB, 생성 자료·비밀값 없음(GeoMAP 원본은
  `data/`, git 밖). node 시험 30개, 로컬 브라우저 시험 통과. `da9ddf7..0db5733` push.
- `deploy/deploy.sh 0db5733`: origin/main 확인 → 릴리스 161 MB(현생누대 자료 43 MB 더함) →
  `current -> releases/0db5733`(이전 f668ec3) → 스모크(`/phanerozoic/` 포함) 통과 → 정리로 259cb61 삭제.
  남은 것 0db5733 f668ec3 b2e6765. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/data/phanerozoic/meta.json`(540–0 Ma) 확인. `tests/browser.mjs`를 https에 대고 전체 통과
  (현생누대 페이지 검사 포함). earththrutime3d `/healthz` 200(주소는 earththrutime.nopeoplestime.info), cdgts 200.

## 재배포: ddb1f49 (현생누대 페이지에 캄브리아기 뒤의 지질 기록 7건)

2026-11-13, 사용자 직접 지시(이 세션): "진행해줘" (push·배포 물음에 대한 답). 첫 `deploy.sh` 실행은 auto mode
권한 검사(Production Deploy)에 막혀 push만 했고, 사용자가 다시 "배포해줘"라고 해 배포했다.

- push 전 점검: 1커밋, 생성 자료·비밀값 없음. node 시험 30개, 로컬 브라우저 시험 통과. `52f5a8e..ddb1f49` push.
- `deploy/deploy.sh ddb1f49`: origin/main 확인 → 릴리스 162 MB → `current -> releases/ddb1f49`(이전 0db5733) →
  스모크 통과 → 정리로 b2e6765 삭제. 남은 것 ddb1f49 0db5733 f668ec3. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/data/phanerozoic/observations.json` 관측 10건 확인. `tests/browser.mjs`를 https에 대고 전체
  통과. earththrutime `/healthz` 200, cdgts 200.

## 재배포: db8c15b (투영법 몰바이데·정거원통, 단면의 시대별 암석 분포)

2026-11-13, 사용자 직접 지시(이 세션): "push/배포 해줘".

- push 전 점검: 2커밋(86efe6e 투영법, db8c15b 시대별 암석), 가장 큰 새 파일 `geology_map.png` 81 KB, 비밀값 없음
  (GeoMAP 원본은 `data/`, git 밖). node 시험 35개, 로컬 브라우저 시험 통과. 단면 자료를 다시 빌드했다.
  `d171760..db8c15b` push.
- `deploy/deploy.sh db8c15b`: origin/main 확인 → 릴리스 162 MB → `current -> releases/db8c15b`(이전 ddb1f49) →
  스모크 통과 → 정리로 f668ec3 삭제. 남은 것 db8c15b ddb1f49 0db5733. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/data/section/geology.png`(82,985 B), `/js/projection.js` 200 확인. `tests/browser.mjs`를 https에
  대고 전체 통과(투영법·암석 레이어 검사 포함). earththrutime `/healthz` 200, cdgts 200.

## 재배포: aac0ef8 (단면의 바다를 반투명 물 덩어리로)

2026-11-13, 사용자 직접 지시(이 세션): "push/배포 해줘".

- push 전 점검: 1커밋(aac0ef8, `section.js`와 devlog만). node 시험 35개, 로컬 브라우저 시험 통과. `0c664bc..aac0ef8` push.
- `deploy/deploy.sh aac0ef8`: 릴리스 162 MB → `current -> releases/aac0ef8`(이전 db8c15b) → 스모크 통과(version.json
  aac0ef8) → 정리로 0db5733 삭제. 남은 것 aac0ef8 db8c15b ddb1f49. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/js/section.js`에 새 코드 확인. `tests/browser.mjs`를 https에 대고 전체 통과. earththrutime `/healthz`
  200, cdgts 200.

## 재배포: b6b8402 (단면의 외톨이 봉우리 칸 없앰)

2026-11-13, 사용자 직접 지시(이 세션): "push/배포해줘."

- push 전 점검: 1커밋(b6b8402, `build_section.py`와 devlog). 단면 자료를 다시 빌드했다(외톨이 봉우리 칸 1,570 → 0).
  node 시험 35개, 로컬 브라우저 시험 통과. `68c57b5..b6b8402` push.
- `deploy/deploy.sh b6b8402`: 릴리스 162 MB → `current -> releases/b6b8402`(이전 aac0ef8) → 스모크 통과(version.json
  b6b8402) → 정리로 ddb1f49 삭제. 남은 것 b6b8402 aac0ef8 db8c15b. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/data/section/surface.bin`이 새로 빌드한 로컬 파일과 같음. `tests/browser.mjs`를 https에 대고 전체 통과.
  earththrutime `/healthz` 200, cdgts 200.

## 재배포: e3297b0 (GeoMAP 칸 단위, 버드층군 하부·상부 쌓기)

2026-11-13, 사용자 직접 지시(이 세션): "push/배포 해줘".

- push 전 점검: 1커밋(e3297b0). 단면 자료를 처음부터 다시 빌드해 meta가 같음을 확인(버드층군 61칸, 시대별 암석 883칸,
  `geology.png`는 더 올리지 않음). node 시험 35개, 로컬 브라우저 시험 통과. `99e315d..e3297b0` push.
- `deploy/deploy.sh e3297b0`: 릴리스 162 MB → `current -> releases/e3297b0`(이전 b6b8402) → 스모크 통과(version.json
  e3297b0) → 정리로 db8c15b 삭제. 남은 것 e3297b0 b6b8402 aac0ef8. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/data/section/meta.json`이 로컬 빌드와 같음, `geology.png`는 404(더 쓰지 않음, 의도). earththrutime
  `/healthz` 200, cdgts 200. `tests/browser.mjs`를 https에 대고 처음 돌린 것은 잡히지 않은 오류로 멈췄다(로그 끝 두 줄만
  남겨 오류 내용을 놓침; 같은 때 로컬에서 Chromium 스크린샷을 함께 돌리던 중). 다시 돌려 전체 통과.

## 재배포: 7860567 (윗면 색 화소별 보간, 입체 핸들)

2026-11-13, 사용자 직접 지시(이 세션): "push/배포해줘".

- push 전 점검: 1커밋(7860567, `section.js`, 시험, devlog). node 시험 35개, 로컬 브라우저 시험 통과(이름표 검사를 고정 시간
  대신 이름표가 바뀔 때까지 기다리게 고침). `440549c..7860567` push.
- `deploy/deploy.sh 7860567`: 릴리스 162 MB → `current -> releases/7860567`(이전 e3297b0) → 스모크 통과(version.json
  7860567) → 정리로 aac0ef8 삭제. 남은 것 7860567 e3297b0 b6b8402. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/js/section.js`가 커밋과 같음. `tests/browser.mjs`를 https에 대고 전체 통과. earththrutime `/healthz` 200,
  cdgts 200.

## 재배포: c309ee5 (매끄러운 지표와 영역 경계)

2026-11-13, 사용자 직접 지시(이 세션): "push/배포 해줘."

- push 전 점검: 1커밋(c309ee5, 새 `site/js/surface.js`, `section.js`, 시험, devlog). node 시험 39개, 로컬 브라우저 시험
  통과(이름표 검사 두 곳을 이름표가 바뀔 때까지 기다리게 고침). `be4f83a..c309ee5` push.
- `deploy/deploy.sh c309ee5`: 릴리스 162 MB → `current -> releases/c309ee5`(이전 7860567) → 스모크 통과(version.json
  c309ee5) → 정리로 b6b8402 삭제. 남은 것 c309ee5 7860567 e3297b0. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/js/section.js`, `/js/surface.js`가 커밋과 같음. `tests/browser.mjs`를 https에 대고 전체 통과.
  earththrutime `/healthz` 200, cdgts 200.

## 재배포: 5674ad0 (핸들 절반, 면마다 색)

2026-11-14, 사용자 직접 지시(이 세션): "push/배포 해줘".

- push 전 점검: 1커밋(5674ad0, `section.js`, devlog). node 시험 39개, 로컬 브라우저 시험 통과. `c2bddb9..5674ad0` push.
- `deploy/deploy.sh 5674ad0`: 릴리스 162 MB → `current -> releases/5674ad0`(이전 c309ee5) → 스모크 통과(version.json
  5674ad0) → 정리로 e3297b0 삭제. 남은 것 5674ad0 c309ee5 7860567. 디스크 여유 24 GB.
- 배포 뒤: 운영 `/js/section.js`가 커밋과 같음. `tests/browser.mjs`를 https에 대고 전체 통과. earththrutime `/healthz` 200,
  cdgts 200.

## 재배포: 96b5b33 (다른 대륙 이름·경계, A–A′ 선, 지형 위 판 경계)

2026-11-14, 사용자 직접 지시(이 세션): "push/배포해줘".

- push 전 점검: 1커밋(96b5b33, `build_section.py`, `section.js`, `section.css`, 시험, devlog). 단면 자료를 다시 빌드했다
  (`region.bin`에 대륙 코드, meta에 `continents`; 남극/없음 칸은 그대로). node 시험 39개, 로컬 브라우저 시험 통과.
  `694071b..96b5b33` push.
- `deploy/deploy.sh 96b5b33`: 릴리스 162 MB → `current -> releases/96b5b33`(이전 5674ad0) → 스모크 통과(version.json
  96b5b33) → 정리로 7860567 삭제. 남은 것 96b5b33 5674ad0 c309ee5. 디스크 여유 23 GB.
- 배포 뒤: 운영 `/js/section.js`, `/data/section/meta.json`, `/data/section/region.bin`이 로컬과 같음. earththrutime
  `/healthz` 200, cdgts 200. **`tests/browser.mjs`를 https에 대고 돌린 것은 실패**: 시대별 암석 레이어를 켜고 "섀클턴 지역
  확대"로 다가간 화면의 스크린샷이 30초 안에 끝나지 않음(`browser.mjs:545`, TimeoutError). 시험용 소프트웨어 렌더러
  (SwiftShader)에서 화면 가득 찬 윗면·암석 레이어 한 프레임이 너무 느린 것 — 기능 오류는 아니고 파일과 쪽은 정상. 되돌리지
  않고 사용자에게 알림; 원인(화소마다 마스크 스플라인)을 줄이는 수정을 이어서 한다.

## 재배포: 247855e (칸 레이어를 제 칸 둘레에만 — 느린 프레임 줄임)

2026-11-14, 사용자 직접 지시(이 세션): "push/배포 해줘".

- push 전 점검: 1커밋(247855e, `section.js`, 시험, devlog). node 시험 39개, 로컬 브라우저 시험 통과. `688c07d..247855e` push.
- `deploy/deploy.sh 247855e`: 릴리스 162 MB → `current -> releases/247855e`(이전 96b5b33) → 스모크 통과(version.json
  247855e) → 정리로 c309ee5 삭제. 남은 것 247855e 96b5b33 5674ad0. 디스크 여유 23 GB.
- 배포 뒤: 운영 `/js/section.js`가 커밋과 같음. `tests/browser.mjs`를 https에 대고 전체 통과(96b5b33 때 넘었던 확대 화면
  스크린샷 포함). earththrutime `/healthz` 200, cdgts 200.

## 재배포: b220681 (아직 생기지 않은 암석은 테두리만, 선을 지표에)

2026-11-14, 사용자 직접 지시(이 세션): "push/배포 해줘".

- push 전 점검: 1커밋(b220681, `section.js`, 시험, devlog). node 시험 39개, 로컬 브라우저 시험 통과. `73d3278..b220681` push.
- `deploy/deploy.sh b220681`: 릴리스 162 MB → `current -> releases/b220681`(이전 247855e) → 스모크 통과(version.json
  b220681) → 정리로 5674ad0 삭제. 남은 것 b220681 247855e 96b5b33. 디스크 여유 22 GB.
- 배포 뒤: 운영 `/js/section.js`가 커밋과 같음. earththrutime `/healthz` 200, cdgts 200. `tests/browser.mjs`를 https에 대고
  처음 돌린 것은 3건 실패: "A 쪽에서 보면 왼쪽 핸들이 보여야" 와 그 핸들 끌기에 딸린 2건. 핸들 보임은 렌더 루프에서 프레임마다
  정하는데 시험은 카메라를 돌린 뒤 400 ms만 기다렸고, 운영 쪽 실행에서는 프레임이 더 느려 그 사이 갱신되지 않았다(로컬은
  통과). 시험이 핸들이 보일 때까지 기다리게 고쳐 운영에 대고 다시 돌려 전체 통과. 쪽은 그대로.
