-- Store network/visitor context that rules already evaluate, so reports can group by it.
ALTER TABLE clicks ADD COLUMN continent TEXT;
ALTER TABLE clicks ADD COLUMN asn INTEGER;
ALTER TABLE clicks ADD COLUMN language TEXT;
ALTER TABLE clicks ADD COLUMN connection TEXT;
