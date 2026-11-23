-- Correct stored PropellerAds tracking-link tokens.
-- Only traffic_source_settings.tokens on rows whose template is propellerads.
-- Lowercases ${ZONEID}, ${CAMPAIGNID}, ${BANNERID}, ${GEO} and ${COST}.
-- Drops the template bannerid token so it is not part of the creative link.
-- Renames the country parameter from geo to country. The macro stays ${geo}.
-- ${SUBID} is unchanged. No other columns or tables are written.

UPDATE traffic_source_settings
SET tokens = replace(replace(replace(replace(replace(
      tokens,
      '${ZONEID}', '${zoneid}'),
      '${CAMPAIGNID}', '${campaignid}'),
      '${BANNERID}', '${bannerid}'),
      '${GEO}', '${geo}'),
      '${COST}', '${cost}')
WHERE template = 'propellerads'
  AND (
    instr(tokens, '${ZONEID}') > 0
    OR instr(tokens, '${CAMPAIGNID}') > 0
    OR instr(tokens, '${BANNERID}') > 0
    OR instr(tokens, '${GEO}') > 0
    OR instr(tokens, '${COST}') > 0
  );

UPDATE traffic_source_settings
SET tokens = replace(
  tokens,
  '{"param":"bannerid","name":"Creative","slot":"sub3","macro":"${bannerid}"},',
  ''
)
WHERE template = 'propellerads'
  AND instr(tokens, '{"param":"bannerid","name":"Creative","slot":"sub3","macro":"${bannerid}"}') > 0;

UPDATE traffic_source_settings
SET tokens = replace(tokens, '"param":"geo","name":"Country"', '"param":"country","name":"Country"')
WHERE template = 'propellerads'
  AND instr(tokens, '"param":"geo","name":"Country"') > 0
  AND instr(tokens, '"macro":"${geo}"') > 0;
