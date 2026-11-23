-- Rewrite stored PropellerAds tracking macros to the tokens the live campaign UI inserts.
-- Only traffic_source_settings.tokens on rows whose template is propellerads.
-- Legacy macros match in any letter case: ${zoneid}, ${campaignid}, ${geo}, ${cost}.
-- A geo parameter is renamed to country when its macro is the country token, whatever the label is.
-- If the row already has a country parameter in any letter case, that legacy geo token is dropped.
-- A bannerid parameter whose macro is ${bannerid} (any letter case, any label) is dropped.
-- ${SUBID} is unchanged. No other columns are written.

UPDATE traffic_source_settings
SET tokens = (
  SELECT COALESCE(json_group_array(
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
  ), '[]')
  FROM json_each(traffic_source_settings.tokens) AS j
  WHERE NOT COALESCE(
    (
      lower(json_extract(j.value, '$.param')) = 'bannerid'
      AND lower(json_extract(j.value, '$.macro')) = '${bannerid}'
    )
    OR (
      lower(json_extract(j.value, '$.param')) = 'geo'
      AND lower(json_extract(j.value, '$.macro')) IN ('${geo}', '{country}')
      AND EXISTS (
        SELECT 1
        FROM json_each(traffic_source_settings.tokens) AS other
        WHERE lower(json_extract(other.value, '$.param')) = 'country'
      )
    ),
    0
  )
)
WHERE template = 'propellerads'
  AND EXISTS (
    SELECT 1
    FROM json_each(traffic_source_settings.tokens) AS j
    WHERE lower(json_extract(j.value, '$.macro')) IN ('${zoneid}', '${campaignid}', '${geo}', '${cost}')
      OR (
        lower(json_extract(j.value, '$.param')) = 'geo'
        AND lower(json_extract(j.value, '$.macro')) IN ('${geo}', '{country}')
      )
      OR (
        lower(json_extract(j.value, '$.param')) = 'bannerid'
        AND lower(json_extract(j.value, '$.macro')) = '${bannerid}'
      )
  );
