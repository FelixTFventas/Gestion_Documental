-- Orden estable aun cuando varios eventos comparten la misma transacción/fecha.
ALTER TABLE events ADD COLUMN sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE decisions ADD CONSTRAINT authorization_area CHECK (kind <> 'AUTHORIZE' OR area_id='gerencia');
ALTER TABLE decisions ADD CONSTRAINT visa_area CHECK (kind <> 'VISA' OR area_id IN ('administrativa','contabilidad'));
