const fs = require('node:fs');
const path = require('node:path');

// Overlay only this feature onto the live rules. The two repositories have
// different unrelated permissions; a full-file deployment would overwrite them.
function competitionRulesOverlay(source) {
  const local = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const policy = local.match(/    \/\/ BEGIN GLOBAL COMPETITION POLICY[\s\S]*?    \/\/ END GLOBAL COMPETITION POLICY/)[0];
  let result = source.replace(/    \/\/ BEGIN GLOBAL COMPETITION POLICY[\s\S]*?    \/\/ END GLOBAL COMPETITION POLICY\n?/, '');
  result = result.replace('match /databases/{database}/documents {', 'match /databases/{database}/documents {\n' + policy);
  for (const collection of ['competitionRecords', 'zTesting_competitionRecords', 'competitionPrizes', 'zTesting_competitionPrizes', 'vouchers', 'zTesting_vouchers']) {
    const match = new RegExp('match /' + collection + '/\\{(\\w+)\\} \\{').exec(result);
    if (!match) throw new Error('Missing rules block: ' + collection);
    let end = match.index + match[0].length;
    let depth = 1;
    for (; end < result.length && depth; end++) {
      if (result[end] === '{') depth++;
      if (result[end] === '}') depth--;
    }
    const period = match[1];
    let block = result.slice(match.index, end);
    if (collection.endsWith('competitionRecords')) {
      block = block.replace(/allow read: if [^;]+;/g, 'allow read: if true;');
      block = block.replace(/allow create, update: if ([^;]+);/, (_, auth) =>
        `allow create, update: if ${auth.replace(/ && validCompetitionMetadata\(\)/g, '')} && validCompetitionMetadata();`);
    } else if (collection.endsWith('competitionPrizes')) {
      block = block.replace(/allow read: if [^;]+;/g, 'allow read: if true;');
      let index = 0;
      block = block.replace(/allow create, update: if ([^;]+);/g, (_, auth) => {
        const clean = auth.replace(/ && validCompetition(?:Prize|Winner)\([^)]*\)/g, '');
        return `allow create, update: if ${clean} && ${index++ === 0 ? `validCompetitionPrize(${period})` : `validCompetitionWinner(${period}, winnerId)`};`;
      });
    } else {
      block = block.replace(/allow create, update: if ([^;]+);/, (_, auth) =>
        `allow create: if ${auth} && validCompetitionVoucherCreate();\n      allow update: if ${auth};`);
      if (!block.includes('validCompetitionVoucherCreate()')) throw new Error('Unrecognized voucher rules: ' + collection);
    }
    result = result.slice(0, match.index) + block + result.slice(end);
  }
  return result;
}
module.exports = {competitionRulesOverlay};
