/**
 * Country catalogue for onboarding and profile editing.
 *
 * WASSAA started Nigeria-only; the deck and the member base are now worldwide,
 * so a member must be able to pick their own country, see the agencies that
 * actually exist there, and store an ISO-2 code the backend can use for the
 * credit-region policy (KB §18E).
 *
 * `military` lists only branches the country actually fields, and each label is
 * the real service name (not "armed forces"), so profiles read accurately.
 */

export interface CountryOption {
  code: string;
  name: string;
  regions: string[];
  military: string[];
  police: string[];
  paramilitary: string[];
}

export const COUNTRIES: CountryOption[] = [
  {
    code: 'NG',
    name: 'Nigeria',
    regions: [
      'Lagos', 'Abuja (FCT)', 'Rivers (Port Harcourt)', 'Oyo (Ibadan)', 'Enugu', 'Kano',
      'Delta (Asaba/Warri)', 'Kaduna', 'Ogun (Abeokuta)', 'Edo (Benin City)',
      'Anambra (Awka/Onitsha)', 'Akwa Ibom (Uyo)', 'Cross River (Calabar)', 'Plateau (Jos)',
      'Ondo', 'Imo (Owerri)', 'Kwara (Ilorin)', 'Osun', 'Abia', 'Other State',
    ],
    military: ['Nigerian Army', 'Nigerian Navy', 'Nigerian Air Force'],
    police: ['Nigerian Police Force'],
    paramilitary: ['NSCDC', 'FRSC', 'Nigeria Immigration Service', 'Nigeria Customs Service', 'Nigerian Correctional Service'],
  },
  {
    code: 'US',
    name: 'United States',
    regions: [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
      'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
      'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
      'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
      'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
      'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
      'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
      'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    ],
    military: ['US Army', 'US Navy', 'US Air Force', 'US Marine Corps', 'US Coast Guard'],
    police: [
      'NYPD', 'LAPD', 'Chicago Police Department', 'Houston Police Department',
      'Atlanta Police Department', 'Miami-Dade Police Department', 'Dallas Police Department',
      'Seattle Police Department', 'Boston Police Department', 'Philadelphia Police Department',
      'Phoenix Police Department', 'Denver Police Department', 'San Diego Police Department',
      'Metropolitan Police Department (DC)',
    ],
    paramilitary: [
      'US Border Patrol', 'US Customs and Border Protection', 'US Marshals Service',
      'Federal Bureau of Prisons', 'National Guard', 'Texas Department of Public Safety',
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    regions: [
      'Greater London', 'Greater Manchester', 'West Midlands', 'West Yorkshire',
      'Merseyside', 'Tyne and Wear', 'Scotland', 'Wales', 'Northern Ireland',
      'South Yorkshire', 'Hampshire', 'Cambridgeshire', 'Oxfordshire', 'East Midlands',
    ],
    military: ['British Army', 'Royal Navy', 'Royal Air Force', 'Royal Marines'],
    police: [
      'Metropolitan Police', 'Greater Manchester Police', 'West Midlands Police',
      'West Yorkshire Police', 'Police Scotland', 'Police Service of Northern Ireland',
      'Thames Valley Police', 'Merseyside Police', 'Avon and Somerset Police',
      'Devon and Cornwall Police',
    ],
    paramilitary: ['Border Force', 'HM Prison Service', 'Ministry of Defence Police', 'British Transport Police'],
  },
  {
    code: 'CA',
    name: 'Canada',
    regions: [
      'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan',
      'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador', 'Prince Edward Island',
    ],
    military: ['Canadian Army', 'Royal Canadian Navy', 'Royal Canadian Air Force'],
    police: [
      'Royal Canadian Mounted Police', 'Toronto Police Service', 'Vancouver Police Department',
      'Calgary Police Service', 'Ontario Provincial Police', 'Sûreté du Québec',
      'Edmonton Police Service', 'Winnipeg Police Service',
    ],
    paramilitary: ['Canada Border Services Agency', 'Correctional Service Canada', 'Canadian Coast Guard'],
  },
  {
    code: 'AU',
    name: 'Australia',
    regions: [
      'New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia',
      'Tasmania', 'Australian Capital Territory', 'Northern Territory',
    ],
    military: ['Australian Army', 'Royal Australian Navy', 'Royal Australian Air Force'],
    police: [
      'New South Wales Police Force', 'Victoria Police', 'Queensland Police Service',
      'Western Australia Police Force', 'South Australia Police', 'Tasmania Police',
      'Australian Federal Police', 'Northern Territory Police',
    ],
    paramilitary: ['Australian Border Force', 'State Emergency Service'],
  },
  {
    code: 'NZ',
    name: 'New Zealand',
    regions: ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Bay of Plenty', 'Otago', 'Manawatū-Whanganui', "Hawke's Bay"],
    military: ['New Zealand Army', 'Royal New Zealand Navy', 'Royal New Zealand Air Force'],
    police: ['New Zealand Police'],
    paramilitary: ['New Zealand Customs Service', 'Department of Corrections'],
  },
  {
    code: 'IE',
    name: 'Ireland',
    regions: ['Leinster', 'Munster', 'Connacht', 'Ulster'],
    military: ['Irish Army', 'Irish Naval Service', 'Irish Air Corps'],
    police: ['An Garda Síochána'],
    paramilitary: ['Irish Prison Service', 'Irish Coast Guard'],
  },
  {
    code: 'DE',
    name: 'Germany',
    regions: [
      'Berlin', 'Bavaria', 'Hamburg', 'Hesse', 'North Rhine-Westphalia',
      'Baden-Württemberg', 'Saxony', 'Lower Saxony', 'Bremen', 'Rhineland-Palatinate',
    ],
    military: ['German Army (Heer)', 'German Navy (Marine)', 'German Air Force (Luftwaffe)'],
    police: ['Bundespolizei', 'Berlin Police', 'Bavarian State Police', 'Hamburg Police', 'North Rhine-Westphalia Police'],
    paramilitary: ['Technisches Hilfswerk', 'German Customs (Zoll)'],
  },
  {
    code: 'FR',
    name: 'France',
    regions: [
      'Île-de-France', 'Auvergne-Rhône-Alpes', "Provence-Alpes-Côte d'Azur", 'Occitanie',
      'Nouvelle-Aquitaine', 'Hauts-de-France', 'Grand Est', 'Brittany', 'Normandy',
    ],
    military: ['French Army (Armée de Terre)', 'French Navy (Marine Nationale)', 'French Air and Space Force'],
    police: ['Police Nationale', 'Gendarmerie Nationale', 'Préfecture de Police de Paris'],
    paramilitary: ['French Customs (Douanes)', 'Sécurité Civile'],
  },
  {
    code: 'IT',
    name: 'Italy',
    regions: ['Lazio', 'Lombardy', 'Campania', 'Piedmont', 'Tuscany', 'Emilia-Romagna', 'Veneto', 'Sicily', 'Liguria', 'Apulia'],
    military: ['Italian Army', 'Italian Navy', 'Italian Air Force'],
    police: ['Polizia di Stato', 'Carabinieri', 'Polizia Locale'],
    paramilitary: ['Guardia di Finanza', 'Guardia Costiera'],
  },
  {
    code: 'ES',
    name: 'Spain',
    regions: [
      'Community of Madrid', 'Catalonia', 'Valencian Community', 'Andalusia', 'Aragon',
      'Basque Country', 'Region of Murcia', 'Castile and León', 'Galicia', 'Balearic Islands',
    ],
    military: ['Spanish Army', 'Spanish Navy', 'Spanish Air and Space Force'],
    police: ['Policía Nacional', 'Policía Local', 'Mossos d’Esquadra', 'Ertzaintza'],
    paramilitary: ['Guardia Civil', 'Unidad Militar de Emergencias'],
  },
  {
    code: 'NL',
    name: 'Netherlands',
    regions: ['North Holland', 'South Holland', 'Utrecht', 'North Brabant', 'Gelderland', 'Groningen', 'Flevoland', 'Limburg'],
    military: ['Royal Netherlands Army', 'Royal Netherlands Navy', 'Royal Netherlands Air Force'],
    police: ['National Police (Politie)', 'Royal Marechaussee'],
    paramilitary: ['Dutch Customs'],
  },
  {
    code: 'PL',
    name: 'Poland',
    regions: ['Masovia', 'Lesser Poland', 'Lower Silesia', 'Pomerania', 'Greater Poland', 'Silesia', 'West Pomerania', 'Lublin', 'Łódź'],
    military: ['Polish Land Forces', 'Polish Navy', 'Polish Air Force'],
    police: ['Policja', 'City Guard (Straż Miejska)'],
    paramilitary: ['Border Guard (Straż Graniczna)', 'State Fire Service'],
  },
  {
    code: 'PT',
    name: 'Portugal',
    regions: ['Lisbon', 'Porto', 'Braga', 'Coimbra', 'Faro', 'Madeira', 'Setúbal', 'Aveiro'],
    military: ['Portuguese Army', 'Portuguese Navy', 'Portuguese Air Force'],
    police: ['Polícia de Segurança Pública (PSP)', 'Polícia Judiciária'],
    paramilitary: ['Guarda Nacional Republicana (GNR)'],
  },
  {
    code: 'BR',
    name: 'Brazil',
    regions: [
      'São Paulo', 'Rio de Janeiro', 'Federal District', 'Bahia', 'Ceará', 'Minas Gerais',
      'Amazonas', 'Paraná', 'Pernambuco', 'Rio Grande do Sul', 'Pará', 'Goiás',
    ],
    military: ['Brazilian Army', 'Brazilian Navy', 'Brazilian Air Force'],
    police: ['Polícia Civil', 'Polícia Federal', 'Polícia Rodoviária Federal'],
    paramilitary: ['Polícia Militar', 'Guarda Municipal', 'Corpo de Bombeiros Militar'],
  },
  {
    code: 'ZA',
    name: 'South Africa',
    regions: ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West'],
    military: ['South African Army', 'South African Navy', 'South African Air Force'],
    police: ['South African Police Service (SAPS)', 'Metro Police'],
    paramilitary: ['SANDF Military Police', 'South African Revenue Service Customs'],
  },
  {
    code: 'KE',
    name: 'Kenya',
    regions: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Uasin Gishu', 'Kiambu', 'Kilifi'],
    military: ['Kenya Army', 'Kenya Navy', 'Kenya Air Force'],
    police: ['Kenya Police Service', 'Administration Police'],
    paramilitary: ['General Service Unit (GSU)', 'Kenya Prisons Service', 'Kenya Wildlife Service'],
  },
  {
    code: 'GH',
    name: 'Ghana',
    regions: ['Greater Accra', 'Ashanti', 'Northern', 'Western', 'Central', 'Volta', 'Eastern'],
    military: ['Ghana Army', 'Ghana Navy', 'Ghana Air Force'],
    police: ['Ghana Police Service', 'Ghana Immigration Service'],
    paramilitary: ['Ghana National Fire Service', 'Ghana Prisons Service'],
  },
];

/**
 * Members outside the catalogue still need to join. `code` is empty so the UI
 * asks for their ISO-2 code and offers generic branch names.
 */
export const OTHER_COUNTRY: CountryOption = {
  code: '',
  name: 'Other country',
  regions: [],
  military: ['Army', 'Navy', 'Air Force', 'Marines', 'Coast Guard'],
  police: ['Police'],
  paramilitary: ['Paramilitary'],
};

export const COUNTRY_OPTIONS: CountryOption[] = [...COUNTRIES, OTHER_COUNTRY];

export function findCountry(code: string | undefined | null): CountryOption {
  return COUNTRIES.find((c) => c.code === (code || '').toUpperCase()) || OTHER_COUNTRY;
}

/** Services for a class of service in one country. */
export function servicesFor(countryCode: string | undefined | null, category: string): string[] {
  const country = findCountry(countryCode);
  if (category === 'Military') return country.military;
  if (category === 'Police') return country.police;
  if (category === 'Paramilitary') return country.paramilitary;
  return [];
}
