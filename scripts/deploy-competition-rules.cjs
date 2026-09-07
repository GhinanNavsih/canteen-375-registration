const admin = require('firebase-admin');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {competitionRulesOverlay} = require('./competition-rules.cjs');

const project = 'point-of-sales-app-25e2b';
async function main() {
  const credential = admin.credential.applicationDefault();
  const {access_token: token} = await credential.getAccessToken();
  const api = async (path, method = 'GET', body) => {
    const response = await fetch('https://firebaserules.googleapis.com/v1/' + path, {
      method, headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  };
  const releasePath = `projects/${project}/releases/cloud.firestore`;
  const release = await api(releasePath);
  const ruleset = await api(release.rulesetName);
  const files = ruleset.source.files;
  if (files.length !== 1) throw new Error('Review multi-file live rules before deploying.');
  const content = competitionRulesOverlay(files[0].content);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  console.log(JSON.stringify({previousRuleset: release.rulesetName, before: digest(files[0].content), after: digest(content), apply: process.argv.includes('--apply')}, null, 2));
  if (files[0].content === content) { console.log('Rules already current.'); return; }
  // Diff from the POS baseline is useful for review, while the overlay itself
  // preserves the live administrator list and every unrelated collection.
  const diff = spawnSync('diff', ['-u', '../point_of_sales_app_v3/firestore.rules', '-'], {input: content, encoding: 'utf8'});
  console.log(diff.stdout);
  if (!process.argv.includes('--apply')) return;
  const candidate = await api(`projects/${project}/rulesets`, 'POST', {
    source: {files: [{...files[0], content}]},
  });
  const latest = await api(releasePath);
  if (latest.rulesetName !== release.rulesetName) throw new Error('Live rules changed during deployment; rerun against the latest version.');
  await api(releasePath, 'PATCH', {release: {name: releasePath, rulesetName: candidate.name}, updateMask: 'rulesetName'});
  const verified = await api(releasePath);
  if (verified.rulesetName !== candidate.name) throw new Error('Rule release verification failed.');
  console.log(JSON.stringify({deployedRuleset: candidate.name, previousRuleset: release.rulesetName}));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
