-- Rewrite stored PropellerAds tracking macros to the tokens the live campaign UI inserts.
-- Only traffic_source_settings.tokens on rows whose template is propellerads.
-- ${zoneid} / ${ZONEID} -> {zone_id}
-- ${campaignid} / ${CAMPAIGNID} -> {campaign_id}
-- ${geo} / ${GEO} -> {country}
-- ${cost} / ${COST} -> {cost}
-- Renames the template country parameter from geo to country when that macro is the country token.
-- ${SUBID} is unchanged. No other columns are written.

UPDATE traffic_source_settings
SET tokens = replace(replace(replace(replace(replace(replace(replace(replace(
      tokens,
      '${ZONEID}', '{zone_id}'),
      '${zoneid}', '{zone_id}'),
      '${CAMPAIGNID}', '{campaign_id}'),
      '${campaignid}', '{campaign_id}'),
      '${GEO}', '{country}'),
      '${geo}', '{country}'),
      '${COST}', '{cost}'),
      '${cost}', '{cost}')
WHERE template = 'propellerads'
  AND (
    instr(tokens, '${ZONEID}') > 0
    OR instr(tokens, '${zoneid}') > 0
    OR instr(tokens, '${CAMPAIGNID}') > 0
    OR instr(tokens, '${campaignid}') > 0
    OR instr(tokens, '${GEO}') > 0
    OR instr(tokens, '${geo}') > 0
    OR instr(tokens, '${COST}') > 0
    OR instr(tokens, '${cost}') > 0
  );

UPDATE traffic_source_settings
SET tokens = replace(tokens, '"param":"geo","name":"Country"', '"param":"country","name":"Country"')
WHERE template = 'propellerads'
  AND instr(tokens, '"param":"geo","name":"Country"') > 0
  AND (
    instr(tokens, '"macro":"{country}"') > 0
    OR instr(tokens, '"macro":"${geo}"') > 0
    OR instr(tokens, '"macro":"${GEO}"') > 0
  );
