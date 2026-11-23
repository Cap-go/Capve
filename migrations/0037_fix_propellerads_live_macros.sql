-- Rewrite stored PropellerAds tracking macros to the tokens the live campaign UI inserts.
-- Only traffic_source_settings.tokens on rows whose template is propellerads.
-- Legacy macros match in any letter case: ${zoneid}, ${campaignid}, ${geo}, ${cost}.
-- A geo parameter is renamed to country when its macro is the country token, whatever the label is.
-- If the row already has a country parameter, that legacy geo token is dropped instead of duplicated.
-- ${SUBID} is unchanged. No other columns are written.

UPDATE traffic_source_settings
SET tokens = (
  SELECT json_group_array(
    CASE
      WHEN json_type(j.value, '$.macro') IS NULL THEN json(j.value)
      ELSE json_set(
        json(j.value),
        '$.macro',
        CASE lower(json_extract(j.value, '$.macro'))
          WHEN '${zoneid}' THEN '{zone_id}'
          WHEN '${campaignid}' THEN '{campaign_id}'
          WHEN '${geo}' THEN '{country}'
          WHEN '${cost}' THEN '{cost}'
          ELSE json_extract(j.value, '$.macro')
        END,
        '$.param',
        CASE
          WHEN lower(json_extract(j.value, '$.param')) = 'geo'
           AND lower(json_extract(j.value, '$.macro')) IN ('${geo}', '{country}')
          THEN 'country'
          ELSE json_extract(j.value, '$.param')
        END
      )
    END
  )
  FROM json_each(traffic_source_settings.tokens) AS j
  WHERE NOT (
    lower(json_extract(j.value, '$.param')) = 'geo'
    AND lower(json_extract(j.value, '$.macro')) IN ('${geo}', '{country}')
    AND EXISTS (
      SELECT 1
      FROM json_each(traffic_source_settings.tokens) AS other
      WHERE lower(json_extract(other.value, '$.param')) = 'country'
    )
  )
)
WHERE template = 'propellerads'
  AND (
    instr(lower(tokens), '${zoneid}') > 0
    OR instr(lower(tokens), '${campaignid}') > 0
    OR instr(lower(tokens), '${geo}') > 0
    OR instr(lower(tokens), '${cost}') > 0
    OR (
      instr(lower(tokens), '"param":"geo"') > 0
      AND instr(lower(tokens), '"macro":"{country}"') > 0
    )
  );
