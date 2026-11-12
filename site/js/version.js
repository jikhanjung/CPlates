// Every data request carries the deployed commit (?v=<commit>), so a browser holding files
// from the previous release under /data/ (served with a one-hour cache) cannot mix them
// with this release's. version.json itself is fetched without the cache. Locally, where
// there is no version.json, the tag is "dev".

let tag = null;

function version() {
  if (!tag) {
    tag = fetch(new URL('../version.json', import.meta.url), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => (v && v.commit ? v.commit.slice(0, 12) : 'dev'))
      .catch(() => 'dev');
  }
  return tag;
}

export async function vfetch(url, options) {
  const v = await version();
  const sep = String(url).includes('?') ? '&' : '?';
  return fetch(`${url}${sep}v=${v}`, options);
}
