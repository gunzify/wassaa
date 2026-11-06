/**
 * Global persona corpus — pure data, no side effects.
 *
 * Feeds the worldwide NPC deck (scripts/seed-npcs.mjs --global): naming pools
 * per culture, the country catalogue (service branches, police and paramilitary
 * agencies, cities with coordinates, local flavour for bios) and the skill
 * pools those personas use.
 *
 * Naming rules: a given name only ever pairs with a family name from the same
 * culture. `race` maps a culture onto a portrait pool (persona-photos.mjs) so a
 * persona's face always matches their name and background.
 */

// ------------------------------------------------------------------ cultures
// id: { country, race, male[], female[], family[] }
// `race` is internal (admin + photo assignment); it is never sent to members.

export const CULTURES = {
  us_anglo: {
    race: 'white',
    male: ['James', 'Michael', 'Christopher', 'Matthew', 'Joshua', 'Daniel', 'Ryan', 'Tyler', 'Brandon', 'Jacob', 'Ethan', 'Austin'],
    female: ['Emily', 'Sarah', 'Ashley', 'Jessica', 'Lauren', 'Megan', 'Rachel', 'Hannah', 'Olivia', 'Emma', 'Madison', 'Abigail'],
    family: ['Smith', 'Johnson', 'Williams', 'Brown', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Clark'],
  },
  us_black: {
    race: 'black',
    male: ['Malik', 'Jamal', 'Tyrone', 'DeAndre', 'Isaiah', 'Andre', 'Darius', 'Marcus', 'Terrence', 'Jalen', 'Xavier', 'Elijah'],
    female: ['Aaliyah', 'Imani', 'Jasmine', 'Keisha', 'Tamara', 'Danielle', 'Monique', 'Latoya', 'Ebony', 'Alicia', 'Brianna', 'Nia'],
    family: ['Washington', 'Jefferson', 'Robinson', 'Coleman', 'Hayes', 'Brooks', 'Banks', 'Freeman', 'Grant', 'Jenkins', 'Booker', 'Whitfield'],
  },
  us_hispanic: {
    race: 'hispanic',
    male: ['José', 'Carlos', 'Miguel', 'Luis', 'Diego', 'Alejandro', 'Javier', 'Mateo', 'Angel', 'Rafael', 'Emilio', 'Santiago'],
    female: ['María', 'Sofía', 'Isabella', 'Camila', 'Valentina', 'Gabriela', 'Lucía', 'Elena', 'Rosa', 'Carmen', 'Daniela', 'Marisol'],
    family: ['García', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera'],
  },
  us_asian: {
    race: 'east_asian',
    male: ['Kevin', 'Brian', 'Daniel', 'Andrew', 'Justin', 'Eric', 'Jason', 'Brandon', 'Nathan', 'Alex', 'David', 'Steven'],
    female: ['Michelle', 'Jennifer', 'Christine', 'Angela', 'Grace', 'Emily', 'Hannah', 'Sophia', 'Jessica', 'Karen', 'Vivian', 'Amy'],
    family: ['Nguyen', 'Tran', 'Kim', 'Park', 'Lee', 'Chen', 'Wong', 'Pham', 'Choi', 'Liu', 'Yang', 'Huang'],
  },
  us_south_asian: {
    race: 'south_asian',
    male: ['Arjun', 'Rohan', 'Rahul', 'Vikram', 'Aditya', 'Karan', 'Neel', 'Sanjay', 'Anil', 'Dev', 'Ravi', 'Sameer'],
    female: ['Priya', 'Ananya', 'Neha', 'Kavita', 'Meera', 'Divya', 'Riya', 'Anjali', 'Shreya', 'Nisha', 'Pooja', 'Sneha'],
    family: ['Patel', 'Shah', 'Singh', 'Kumar', 'Sharma', 'Gupta', 'Mehta', 'Desai', 'Reddy', 'Nair', 'Iyer', 'Joshi'],
  },
  uk_white: {
    race: 'white',
    male: ['Oliver', 'Harry', 'Jack', 'George', 'Thomas', 'James', 'William', 'Henry', 'Charlie', 'Edward', 'Daniel', 'Samuel'],
    female: ['Olivia', 'Amelia', 'Isla', 'Emily', 'Grace', 'Charlotte', 'Sophie', 'Ella', 'Freya', 'Lucy', 'Hannah', 'Katie'],
    family: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright', 'Evans', 'Clarke'],
  },
  uk_black: {
    race: 'black',
    male: ['Andre', 'Dwayne', 'Delroy', 'Jerome', 'Marlon', 'Trevor', 'Courtney', 'Ricardo', 'Jermaine', 'Devon', 'Sheldon', 'Aaron'],
    female: ['Chantelle', 'Shanice', 'Aisha', 'Keisha', 'Tanisha', 'Rochelle', 'Simone', 'Naomi', 'Jade', 'Alicia', 'Leanne', 'Natalie'],
    family: ['Campbell', 'Clarke', 'Henry', 'Charles', 'Alexander', 'Edwards', 'Grant', 'Reid', 'Beckford', 'Bennett', 'Powell', 'Francis'],
  },
  uk_south_asian: {
    race: 'south_asian',
    male: ['Imran', 'Aamir', 'Zain', 'Hassan', 'Faisal', 'Arjun', 'Rohan', 'Rahul', 'Sanjay', 'Adil', 'Tariq', 'Nadeem'],
    female: ['Aisha', 'Fatima', 'Zara', 'Sana', 'Hira', 'Nadia', 'Priya', 'Ananya', 'Neha', 'Saima', 'Rabia', 'Meera'],
    family: ['Khan', 'Ahmed', 'Ali', 'Hussain', 'Malik', 'Chaudhry', 'Patel', 'Shah', 'Singh', 'Sharma', 'Iqbal', 'Mahmood'],
  },
  ca_anglo: {
    race: 'white',
    male: ['Liam', 'Noah', 'Ethan', 'Lucas', 'Owen', 'Nathan', 'Ryan', 'Connor', 'Jacob', 'Caleb', 'Mason', 'Logan'],
    female: ['Emma', 'Olivia', 'Ava', 'Sophia', 'Chloe', 'Emily', 'Hannah', 'Madison', 'Sarah', 'Megan', 'Ella', 'Grace'],
    family: ['Smith', 'Brown', 'Martin', 'Wilson', 'MacDonald', 'Campbell', 'Taylor', 'Anderson', 'Scott', 'Murray', 'Fraser', 'Ross'],
  },
  ca_french: {
    race: 'white',
    male: ['Mathieu', 'Gabriel', 'Olivier', 'Étienne', 'Louis', 'Antoine', 'Samuel', 'Vincent', 'Maxime', 'Hugo', 'Simon', 'Julien'],
    female: ['Camille', 'Émilie', 'Sophie', 'Marie', 'Charlotte', 'Juliette', 'Léa', 'Audrey', 'Geneviève', 'Isabelle', 'Chloé', 'Manon'],
    family: ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Ouellet', 'Pelletier', 'Bélanger'],
  },
  ca_black: {
    race: 'black',
    male: ['Andre', 'Marcus', 'Dwayne', 'Jerome', 'Courtney', 'Trevor', 'Ricardo', 'Devon', 'Aaron', 'Sheldon', 'Marlon', 'Kwame'],
    female: ['Chantelle', 'Shanice', 'Aisha', 'Simone', 'Naomi', 'Jade', 'Alicia', 'Leanne', 'Natalie', 'Rochelle', 'Keisha', 'Amara'],
    family: ['Campbell', 'Williams', 'Charles', 'Alexander', 'Edwards', 'Grant', 'Reid', 'Bennett', 'Powell', 'Francis', 'Henry', 'Clarke'],
  },
  au_anglo: {
    race: 'white',
    male: ['Jack', 'Lachlan', 'Riley', 'Cooper', 'Hunter', 'Jayden', 'Mitchell', 'Blake', 'Cameron', 'Liam', 'Noah', 'Ethan'],
    female: ['Chloe', 'Matilda', 'Ruby', 'Grace', 'Willow', 'Ella', 'Mia', 'Charlotte', 'Zoe', 'Sienna', 'Isla', 'Ava'],
    family: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin', 'Anderson', 'Thompson', 'Kelly'],
  },
  de_white: {
    race: 'white',
    male: ['Lukas', 'Jonas', 'Leon', 'Finn', 'Maximilian', 'Felix', 'Niklas', 'Julian', 'Tim', 'Moritz', 'David', 'Jan'],
    female: ['Lena', 'Anna', 'Laura', 'Julia', 'Sophie', 'Marie', 'Lea', 'Hannah', 'Johanna', 'Katharina', 'Sarah', 'Mia'],
    family: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch'],
  },
  de_turkish: {
    race: 'mena',
    male: ['Emre', 'Mehmet', 'Murat', 'Cem', 'Ali', 'Burak', 'Kerem', 'Serkan', 'Tolga', 'Yusuf', 'Hakan', 'Deniz'],
    female: ['Elif', 'Ayşe', 'Zeynep', 'Merve', 'Selin', 'Derya', 'Esra', 'Fatma', 'Gamze', 'Hatice', 'Melis', 'Sibel'],
    family: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç'],
  },
  fr_white: {
    race: 'white',
    male: ['Lucas', 'Hugo', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Adam', 'Raphaël', 'Nathan', 'Théo', 'Paul', 'Antoine'],
    female: ['Emma', 'Léa', 'Chloé', 'Manon', 'Camille', 'Sarah', 'Julie', 'Louise', 'Alice', 'Clara', 'Jeanne', 'Margaux'],
    family: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent'],
  },
  fr_black: {
    race: 'black',
    male: ['Kévin', 'Jordan', 'Steeve', 'Ludovic', 'Fabrice', 'Dimitri', 'Wesley', 'Bryan', 'Christopher', 'Teddy', 'Moussa', 'Ibrahim'],
    female: ['Aïcha', 'Fatou', 'Aminata', 'Nadège', 'Cindy', 'Laetitia', 'Sabrina', 'Awa', 'Mariam', 'Yasmine', 'Amina', 'Grace'],
    family: ['Diallo', 'Traoré', 'Koné', 'Diop', 'Ndiaye', 'Ba', 'Camara', 'Touré', 'Keita', 'Sow', 'Sy', 'Fofana'],
  },
  fr_north_african: {
    race: 'mena',
    male: ['Karim', 'Youssef', 'Mehdi', 'Sofiane', 'Bilal', 'Rayan', 'Nabil', 'Samir', 'Hicham', 'Adam', 'Ilyes', 'Anis'],
    female: ['Inès', 'Lina', 'Yasmine', 'Sarah', 'Amina', 'Nadia', 'Leïla', 'Sofia', 'Meryem', 'Rania', 'Sabrina', 'Kenza'],
    family: ['Benali', 'Bouzid', 'Haddad', 'Mansouri', 'Bensalem', 'Cherif', 'Amrani', 'Khelifi', 'Boudjema', 'Saidi', 'Belkacem', 'Rahmani'],
  },
  it_white: {
    race: 'white',
    male: ['Marco', 'Luca', 'Alessandro', 'Matteo', 'Andrea', 'Davide', 'Simone', 'Francesco', 'Lorenzo', 'Riccardo', 'Gabriele', 'Stefano'],
    female: ['Giulia', 'Chiara', 'Sara', 'Martina', 'Francesca', 'Alessia', 'Valentina', 'Elena', 'Federica', 'Elisa', 'Sofia', 'Alice'],
    family: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo'],
  },
  es_white: {
    race: 'white',
    male: ['Javier', 'Sergio', 'Carlos', 'Pablo', 'Álvaro', 'Diego', 'Adrián', 'Mario', 'Rubén', 'Iván', 'Alejandro', 'Daniel'],
    female: ['Lucía', 'María', 'Paula', 'Laura', 'Marta', 'Elena', 'Carmen', 'Ana', 'Sara', 'Cristina', 'Irene', 'Alba'],
    family: ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Fernández', 'Ruiz', 'Díaz', 'Moreno', 'Álvarez', 'Romero'],
  },
  nl_white: {
    race: 'white',
    male: ['Daan', 'Sem', 'Lucas', 'Bram', 'Thijs', 'Lars', 'Stijn', 'Jesse', 'Tim', 'Ruben', 'Finn', 'Koen'],
    female: ['Emma', 'Julia', 'Sophie', 'Anna', 'Lotte', 'Sanne', 'Eva', 'Fleur', 'Noor', 'Isa', 'Femke', 'Roos'],
    family: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'van Dijk', 'Bakker', 'Janssen', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder'],
  },
  nl_black: {
    race: 'black',
    male: ['Dwayne', 'Ricardo', 'Delroy', 'Marlon', 'Andre', 'Jermaine', 'Devon', 'Trevor', 'Courtney', 'Sheldon', 'Quincy', 'Rayan'],
    female: ['Chantelle', 'Shanice', 'Naomi', 'Simone', 'Jade', 'Rochelle', 'Leanne', 'Natalie', 'Aisha', 'Keisha', 'Tanisha', 'Amara'],
    family: ['Campbell', 'Williams', 'Charles', 'Alexander', 'Edwards', 'Grant', 'Reid', 'Bennett', 'Powell', 'Francis', 'Henry', 'Jones'],
  },
  ie_white: {
    race: 'white',
    male: ['Cian', 'Darragh', 'Conor', 'Sean', 'Pádraig', 'Niall', 'Eoin', 'Ronan', 'Liam', 'Fionn', 'Cathal', 'Oisín'],
    female: ['Aoife', 'Niamh', 'Saoirse', 'Ciara', 'Orla', 'Sinéad', 'Aisling', 'Gráinne', 'Siobhán', 'Maeve', 'Róisín', 'Clodagh'],
    family: ['Murphy', 'Kelly', "O'Sullivan", 'Walsh', "O'Brien", 'Byrne', 'Ryan', "O'Connor", 'McCarthy', 'Doyle', 'Kennedy', 'Lynch'],
  },
  nz_anglo: {
    race: 'white',
    male: ['Liam', 'Jack', 'Oliver', 'James', 'Lucas', 'Mason', 'Hunter', 'Finn', 'Blake', 'Cameron', 'Ethan', 'Noah'],
    female: ['Charlotte', 'Olivia', 'Isla', 'Sophie', 'Ella', 'Ruby', 'Grace', 'Amelia', 'Zoe', 'Lucy', 'Mia', 'Ava'],
    family: ['Smith', 'Wilson', 'Williams', 'Brown', 'Taylor', 'Thompson', 'Clark', 'Walker', 'Robinson', 'Campbell', 'Stewart', 'King'],
  },
  nz_maori: {
    race: 'mixed',
    male: ['Tama', 'Rawiri', 'Hemi', 'Manaia', 'Nikau', 'Wiremu', 'Kauri', 'Tane', 'Rangi', 'Ariki', 'Matiu', 'Hone'],
    female: ['Aroha', 'Moana', 'Kiri', 'Anahera', 'Maia', 'Hine', 'Ngaio', 'Tui', 'Aria', 'Marama', 'Kahu', 'Waimarie'],
    family: ['Ngata', 'Parata', 'Rangi', 'Tane', 'Henare', 'Walker', 'Kingi', 'Tawhiri', 'Paora', 'Te Rangi', 'Hohaia', 'Waretini'],
  },
  pl_white: {
    race: 'white',
    male: ['Jakub', 'Kacper', 'Szymon', 'Antoni', 'Filip', 'Jan', 'Michał', 'Mateusz', 'Bartosz', 'Piotr', 'Tomasz', 'Adam'],
    female: ['Zofia', 'Julia', 'Zuzanna', 'Hanna', 'Maja', 'Aleksandra', 'Natalia', 'Wiktoria', 'Anna', 'Magdalena', 'Karolina', 'Agnieszka'],
    family: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski'],
  },
  pt_white: {
    race: 'white',
    male: ['João', 'Miguel', 'Tiago', 'Pedro', 'Duarte', 'Gonçalo', 'Rafael', 'Diogo', 'Francisco', 'André', 'Tomás', 'Vasco'],
    female: ['Maria', 'Ana', 'Beatriz', 'Inês', 'Mariana', 'Sofia', 'Catarina', 'Rita', 'Joana', 'Carolina', 'Francisca', 'Teresa'],
    family: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Lopes'],
  },
  pt_black: {
    race: 'black',
    male: ['Adilson', 'Nelson', 'Ivanildo', 'Wilson', 'Éder', 'Mário', 'Paulo', 'Djodje', 'Nilton', 'Carlos', 'Bruno', 'Elisandro'],
    female: ['Elisângela', 'Neusa', 'Cátia', 'Vera', 'Sandra', 'Lúcia', 'Djina', 'Edna', 'Sónia', 'Milena', 'Carla', 'Isabel'],
    family: ['Semedo', 'Tavares', 'Monteiro', 'Lopes', 'Fortes', 'Évora', 'Fonseca', 'Ramos', 'Correia', 'Mendes', 'Cardoso', 'Brito'],
  },
  br_white: {
    race: 'white',
    male: ['Lucas', 'Gabriel', 'Matheus', 'Rafael', 'Pedro', 'João', 'Guilherme', 'Bruno', 'Felipe', 'Thiago', 'Vinícius', 'Leonardo'],
    female: ['Ana', 'Julia', 'Beatriz', 'Mariana', 'Camila', 'Larissa', 'Fernanda', 'Letícia', 'Gabriela', 'Amanda', 'Carolina', 'Bruna'],
    family: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro'],
  },
  br_black: {
    race: 'black',
    male: ['Wesley', 'Everton', 'Jefferson', 'Anderson', 'Douglas', 'Marcelo', 'Vinícius', 'Robson', 'Cleiton', 'Wagner', 'Jonatas', 'Ronaldo'],
    female: ['Jéssica', 'Taís', 'Daiane', 'Michele', 'Patrícia', 'Simone', 'Cíntia', 'Rosângela', 'Vanessa', 'Luana', 'Jaqueline', 'Aline'],
    family: ['da Silva', 'dos Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho'],
  },
  br_mixed: {
    race: 'mixed',
    male: ['Caio', 'Enzo', 'Davi', 'Murilo', 'Otávio', 'Vitor', 'Yuri', 'Ícaro', 'Heitor', 'Bento', 'Arthur', 'Samuel'],
    female: ['Isadora', 'Manuela', 'Heloísa', 'Alice', 'Valentina', 'Sophia', 'Yasmin', 'Lorena', 'Cecília', 'Laura', 'Emanuelly', 'Clara'],
    family: ['da Silva', 'dos Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Nascimento', 'Araújo', 'Ribeiro', 'Gomes'],
  },
  za_black: {
    race: 'black',
    male: ['Sipho', 'Thabo', 'Bongani', 'Luthando', 'Sibusiso', 'Kagiso', 'Tshepo', 'Mandla', 'Andile', 'Musa', 'Sizwe', 'Njabulo'],
    female: ['Nomsa', 'Thandiwe', 'Lerato', 'Naledi', 'Zanele', 'Ayanda', 'Palesa', 'Nandi', 'Busisiwe', 'Refilwe', 'Nomvula', 'Zinhle'],
    family: ['Dlamini', 'Nkosi', 'Ndlovu', 'Khumalo', 'Mokoena', 'Molefe', 'Mabaso', 'Zulu', 'Mthembu', 'Radebe', 'Sithole', 'Mahlangu'],
  },
  za_white: {
    race: 'white',
    male: ['Johan', 'Pieter', 'Ruan', 'Willem', 'Christiaan', 'Dewald', 'Francois', 'Stefan', 'Jaco', 'Heinrich', 'Bernard', 'Divan'],
    female: ['Anika', 'Elsa', 'Marike', 'Lize', 'Anja', 'Chantel', 'Ilse', 'Marli', 'Riana', 'Suné', 'Elmarie', 'Karin'],
    family: ['van der Merwe', 'Botha', 'Pretorius', 'du Plessis', 'Venter', 'Nel', 'Coetzee', 'Fourie', 'Steyn', 'van Wyk', 'Joubert', 'Kruger'],
  },
  za_coloured: {
    race: 'mixed',
    male: ['Ashley', 'Bradley', 'Clayton', 'Deon', 'Fabian', 'Gershwin', 'Marlon', 'Ricardo', 'Shaun', 'Trevor', 'Keagan', 'Chad'],
    female: ['Chantel', 'Charmaine', 'Felicity', 'Juanita', 'Leanne', 'Melissa', 'Nadine', 'Shireen', 'Vanessa', 'Deshni', 'Rene', 'Cindy'],
    family: ['Adams', 'Abrahams', 'Daniels', 'Davids', 'Fortuin', 'Hendricks', 'Jacobs', 'Josephs', 'Maart', 'Petersen', 'Pietersen', 'Solomons'],
  },
  za_indian: {
    race: 'south_asian',
    male: ['Ashwin', 'Dinesh', 'Kavesh', 'Keshav', 'Naren', 'Pranesh', 'Rishi', 'Suren', 'Vikesh', 'Yugen', 'Nithin', 'Kubendran'],
    female: ['Anusha', 'Deveshni', 'Kirthi', 'Nalini', 'Priya', 'Reshma', 'Shanti', 'Sharmila', 'Vashti', 'Yashika', 'Divya', 'Nishana'],
    family: ['Naidoo', 'Pillay', 'Govender', 'Moodley', 'Reddy', 'Chetty', 'Padayachee', 'Naicker', 'Maharaj', 'Singh', 'Ramsamy', 'Munsamy'],
  },
  ke_black: {
    race: 'black',
    male: ['Brian', 'Kelvin', 'Dennis', 'Collins', 'Kevin', 'Moses', 'Peter', 'Samuel', 'Victor', 'Wycliffe', 'George', 'Emmanuel'],
    female: ['Wanjiku', 'Akinyi', 'Njeri', 'Wambui', 'Achieng', 'Nyokabi', 'Chebet', 'Faith', 'Mercy', 'Grace', 'Esther', 'Caroline'],
    family: ['Mwangi', 'Otieno', 'Ochieng', 'Kamau', 'Kariuki', 'Odhiambo', 'Wanjala', 'Mutua', 'Kiptoo', 'Cheruiyot', 'Maina', 'Njoroge'],
  },
  gh_black: {
    race: 'black',
    male: ['Kwame', 'Kofi', 'Kwesi', 'Yaw', 'Kojo', 'Nana', 'Kwaku', 'Fiifi', 'Kwabena', 'Ebo', 'Daniel', 'Emmanuel'],
    female: ['Ama', 'Akosua', 'Adwoa', 'Abena', 'Akua', 'Yaa', 'Efua', 'Esi', 'Naa', 'Serwaa', 'Akorfa', 'Maame'],
    family: ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Osei', 'Appiah', 'Agyeman', 'Frimpong', 'Darko', 'Amoah', 'Addo', 'Antwi'],
  },
};

// ----------------------------------------------------------------- countries
// weight  = share of the global deck
// cultures = [cultureId, weight] — drives names and the portrait pool
// military = [service label, branch kind] — branch is explicit: army / navy /
//            air / marines / coast. Only countries that actually field a branch
//            list it.
// police / paramilitary = real agency names.
// cities = [city, region, lat, lng]
// flavour = local references used when composing bios.

export const COUNTRIES = {
  US: {
    name: 'United States',
    weight: 0.31,
    cultures: [['us_anglo', 0.58], ['us_black', 0.14], ['us_hispanic', 0.16], ['us_asian', 0.06], ['us_south_asian', 0.06]],
    military: [['US Army', 'army'], ['US Navy', 'navy'], ['US Air Force', 'air'], ['US Marine Corps', 'marines'], ['US Coast Guard', 'coast']],
    police: ['NYPD', 'LAPD', 'Chicago Police Department', 'Houston Police Department', 'Atlanta Police Department', 'Miami-Dade Police Department', 'Dallas Police Department', 'Seattle Police Department', 'Boston Police Department', 'Philadelphia Police Department', 'Phoenix Police Department', 'Denver Police Department', 'San Diego Police Department', 'Metropolitan Police Department (DC)'],
    paramilitary: ['US Border Patrol', 'US Customs and Border Protection', 'US Marshals Service', 'Federal Bureau of Prisons', 'National Guard', 'Texas Department of Public Safety'],
    cities: [
      ['New York City', 'New York', 40.7128, -74.0060],
      ['Los Angeles', 'California', 34.0522, -118.2437],
      ['Chicago', 'Illinois', 41.8781, -87.6298],
      ['Houston', 'Texas', 29.7604, -95.3698],
      ['Atlanta', 'Georgia', 33.7490, -84.3880],
      ['Miami', 'Florida', 25.7617, -80.1918],
      ['Dallas', 'Texas', 32.7767, -96.7970],
      ['Phoenix', 'Arizona', 33.4484, -112.0740],
      ['Seattle', 'Washington', 47.6062, -122.3321],
      ['Denver', 'Colorado', 39.7392, -104.9903],
      ['San Diego', 'California', 32.7157, -117.1611],
      ['Washington', 'District of Columbia', 38.9072, -77.0369],
      ['Boston', 'Massachusetts', 42.3601, -71.0589],
      ['Philadelphia', 'Pennsylvania', 39.9526, -75.1652],
      ['Las Vegas', 'Nevada', 36.1699, -115.1398],
      ['Nashville', 'Tennessee', 36.1627, -86.7816],
      ['Charlotte', 'North Carolina', 35.2271, -80.8431],
      ['San Antonio', 'Texas', 29.4241, -98.4936],
      ['Austin', 'Texas', 30.2672, -97.7431],
      ['Tampa', 'Florida', 27.9506, -82.4572],
      ['Minneapolis', 'Minnesota', 44.9778, -93.2650],
      ['New Orleans', 'Louisiana', 29.9511, -90.0715],
      ['Kansas City', 'Missouri', 39.0997, -94.5786],
      ['Portland', 'Oregon', 45.5152, -122.6784],
      ['Honolulu', 'Hawaii', 21.3069, -157.8583],
    ],
    flavour: {
      food: ['a proper diner breakfast', 'tacos from a food truck', 'Sunday barbecue', 'a good burger', 'deep-dish pizza'],
      places: ['the boardwalk', 'a national park', 'the farmers market', 'a local brewery', 'the lakefront'],
      habits: ['Sunday football', 'road trips', 'farmers markets', 'college game days', 'line dancing'],
    },
  },
  GB: {
    name: 'United Kingdom',
    weight: 0.16,
    cultures: [['uk_white', 0.66], ['uk_black', 0.14], ['uk_south_asian', 0.20]],
    military: [['British Army', 'army'], ['Royal Navy', 'navy'], ['Royal Air Force', 'air'], ['Royal Marines', 'marines']],
    police: ['Metropolitan Police', 'Greater Manchester Police', 'West Midlands Police', 'West Yorkshire Police', 'Police Scotland', 'Police Service of Northern Ireland', 'Thames Valley Police', 'Merseyside Police', 'Avon and Somerset Police', 'Devon and Cornwall Police'],
    paramilitary: ['Border Force', 'HM Prison Service', 'Ministry of Defence Police', 'British Transport Police', 'Civil Nuclear Constabulary'],
    cities: [
      ['London', 'Greater London', 51.5074, -0.1278],
      ['Manchester', 'Greater Manchester', 53.4808, -2.2426],
      ['Birmingham', 'West Midlands', 52.4862, -1.8904],
      ['Leeds', 'West Yorkshire', 53.8008, -1.5491],
      ['Glasgow', 'Scotland', 55.8642, -4.2518],
      ['Edinburgh', 'Scotland', 55.9533, -3.1883],
      ['Liverpool', 'Merseyside', 53.4084, -2.9916],
      ['Bristol', 'South West England', 51.4545, -2.5879],
      ['Newcastle', 'Tyne and Wear', 54.9783, -1.6178],
      ['Cardiff', 'Wales', 51.4816, -3.1791],
      ['Belfast', 'Northern Ireland', 54.5973, -5.9301],
      ['Nottingham', 'East Midlands', 52.9548, -1.1581],
      ['Sheffield', 'South Yorkshire', 53.3811, -1.4701],
      ['Southampton', 'Hampshire', 50.9097, -1.4044],
      ['Cambridge', 'Cambridgeshire', 52.2053, 0.1218],
      ['Oxford', 'Oxfordshire', 51.7520, -1.2577],
    ],
    flavour: {
      food: ['a proper Sunday roast', 'fish and chips by the sea', 'a full English', 'a decent curry', 'afternoon tea'],
      places: ['the seaside', 'a country pub', 'the moors', 'a football ground', 'the coast path'],
      habits: ['pub quizzes', 'Saturday football', 'country walks', 'Sunday roasts', 'festival season'],
    },
  },
  CA: {
    name: 'Canada',
    weight: 0.08,
    cultures: [['ca_anglo', 0.74], ['ca_french', 0.18], ['ca_black', 0.08]],
    military: [['Canadian Army', 'army'], ['Royal Canadian Navy', 'navy'], ['Royal Canadian Air Force', 'air']],
    police: ['Royal Canadian Mounted Police', 'Toronto Police Service', 'Vancouver Police Department', 'Calgary Police Service', 'Ontario Provincial Police', 'Sûreté du Québec', 'Edmonton Police Service', 'Winnipeg Police Service'],
    paramilitary: ['Canada Border Services Agency', 'Correctional Service Canada', 'Canadian Coast Guard'],
    cities: [
      ['Toronto', 'Ontario', 43.6532, -79.3832],
      ['Vancouver', 'British Columbia', 49.2827, -123.1207],
      ['Montreal', 'Quebec', 45.5017, -73.5673],
      ['Calgary', 'Alberta', 51.0447, -114.0719],
      ['Ottawa', 'Ontario', 45.4215, -75.6972],
      ['Edmonton', 'Alberta', 53.5461, -113.4938],
      ['Quebec City', 'Quebec', 46.8139, -71.2080],
      ['Winnipeg', 'Manitoba', 49.8951, -97.1384],
      ['Halifax', 'Nova Scotia', 44.6488, -63.5752],
      ['Victoria', 'British Columbia', 48.4284, -123.3656],
      ['Saskatoon', 'Saskatchewan', 52.1332, -106.6700],
      ["St. John's", 'Newfoundland and Labrador', 47.5615, -52.7126],
    ],
    flavour: {
      food: ['poutine at 2am', 'a proper Montreal bagel', 'butter tarts', 'a backyard barbecue', 'maple everything'],
      places: ['the lake', 'a ski hill', 'the cottage', 'a hockey rink', 'the Rockies'],
      habits: ['hockey nights', 'cottage weekends', 'winter hikes', 'tim Hortons runs', 'camping trips'],
    },
  },
  AU: {
    name: 'Australia',
    weight: 0.07,
    cultures: [['au_anglo', 0.82], ['us_asian', 0.10], ['uk_south_asian', 0.08]],
    military: [['Australian Army', 'army'], ['Royal Australian Navy', 'navy'], ['Royal Australian Air Force', 'air']],
    police: ['New South Wales Police Force', 'Victoria Police', 'Queensland Police Service', 'Western Australia Police Force', 'South Australia Police', 'Tasmania Police', 'Australian Federal Police', 'Northern Territory Police'],
    paramilitary: ['Australian Border Force', 'State Emergency Service', 'Australian Customs'],
    cities: [
      ['Sydney', 'New South Wales', -33.8688, 151.2093],
      ['Melbourne', 'Victoria', -37.8136, 144.9631],
      ['Brisbane', 'Queensland', -27.4698, 153.0251],
      ['Perth', 'Western Australia', -31.9505, 115.8605],
      ['Adelaide', 'South Australia', -34.9285, 138.6007],
      ['Gold Coast', 'Queensland', -28.0167, 153.4000],
      ['Canberra', 'Australian Capital Territory', -35.2809, 149.1300],
      ['Newcastle', 'New South Wales', -32.9283, 151.7817],
      ['Wollongong', 'New South Wales', -34.4278, 150.8931],
      ['Hobart', 'Tasmania', -42.8821, 147.3272],
      ['Darwin', 'Northern Territory', -12.4634, 130.8456],
      ['Cairns', 'Queensland', -16.9186, 145.7781],
    ],
    flavour: {
      food: ['a beachside barbie', 'flat whites', 'meat pies', 'fish and chips', 'a proper brunch'],
      places: ['the beach', 'a coastal walk', 'the bush', 'a local footy ground', 'the reef'],
      habits: ['surfing at dawn', 'AFL weekends', 'camping trips', 'beach walks', 'cricket in summer'],
    },
  },
  NZ: {
    name: 'New Zealand',
    weight: 0.02,
    cultures: [['nz_anglo', 0.78], ['nz_maori', 0.14], ['us_asian', 0.08]],
    military: [['New Zealand Army', 'army'], ['Royal New Zealand Navy', 'navy'], ['Royal New Zealand Air Force', 'air']],
    police: ['New Zealand Police'],
    paramilitary: ['New Zealand Customs Service', 'Department of Corrections', 'Fire and Emergency New Zealand'],
    cities: [
      ['Auckland', 'Auckland', -36.8485, 174.7633],
      ['Wellington', 'Wellington', -41.2866, 174.7756],
      ['Christchurch', 'Canterbury', -43.5321, 172.6362],
      ['Hamilton', 'Waikato', -37.7870, 175.2793],
      ['Tauranga', 'Bay of Plenty', -37.6878, 176.1651],
      ['Dunedin', 'Otago', -45.8788, 170.5028],
      ['Palmerston North', 'Manawatu-Whanganui', -40.3523, 175.6082],
      ['Napier', "Hawke's Bay", -39.4928, 176.9120],
    ],
    flavour: {
      food: ['a proper hāngī', 'fish and chips on the beach', 'a Sunday roast', 'flat whites', 'fresh kaimoana'],
      places: ['the beach', 'the bush', 'a mountain track', 'the harbour', 'a rugby ground'],
      habits: ['rugby weekends', 'tramping', 'surfing', 'BBQs', 'road trips'],
    },
  },
  IE: {
    name: 'Ireland',
    weight: 0.02,
    cultures: [['ie_white', 0.92], ['uk_black', 0.05], ['us_asian', 0.03]],
    military: [['Irish Army', 'army'], ['Irish Naval Service', 'navy'], ['Irish Air Corps', 'air']],
    police: ['An Garda Síochána'],
    paramilitary: ['Irish Prison Service', 'Revenue Commissioners', 'Irish Coast Guard'],
    cities: [
      ['Dublin', 'Leinster', 53.3498, -6.2603],
      ['Cork', 'Munster', 51.8985, -8.4756],
      ['Galway', 'Connacht', 53.2707, -9.0568],
      ['Limerick', 'Munster', 52.6638, -8.6267],
      ['Waterford', 'Munster', 52.2592, -7.1101],
      ['Kilkenny', 'Leinster', 52.6541, -7.2448],
      ['Drogheda', 'Leinster', 53.7179, -6.3566],
      ['Sligo', 'Connacht', 54.2766, -8.4761],
    ],
    flavour: {
      food: ['a proper Irish stew', 'fish and chips', 'a full Irish', 'brown bread', 'a Sunday carvery'],
      places: ['the coast', 'a trad pub', 'the mountains', 'a GAA pitch', 'the cliffs'],
      habits: ['GAA matches', 'trad sessions', 'sea swims', 'hill walks', 'Saturday rugby'],
    },
  },
  DE: {
    name: 'Germany',
    weight: 0.06,
    cultures: [['de_white', 0.88], ['de_turkish', 0.12]],
    military: [['German Army (Heer)', 'army'], ['German Navy (Marine)', 'navy'], ['German Air Force (Luftwaffe)', 'air']],
    police: ['Bundespolizei', 'Berlin Police', 'Bavarian State Police', 'Hamburg Police', 'North Rhine-Westphalia Police', 'Hesse State Police'],
    paramilitary: ['Technisches Hilfswerk', 'German Customs (Zoll)', 'Federal Office for Civil Protection'],
    cities: [
      ['Berlin', 'Berlin', 52.5200, 13.4050],
      ['Munich', 'Bavaria', 48.1351, 11.5820],
      ['Hamburg', 'Hamburg', 53.5511, 9.9937],
      ['Frankfurt', 'Hesse', 50.1109, 8.6821],
      ['Cologne', 'North Rhine-Westphalia', 50.9375, 6.9603],
      ['Stuttgart', 'Baden-Württemberg', 48.7758, 9.1829],
      ['Düsseldorf', 'North Rhine-Westphalia', 51.2277, 6.7735],
      ['Leipzig', 'Saxony', 51.3397, 12.3731],
      ['Dresden', 'Saxony', 51.0504, 13.7373],
      ['Nuremberg', 'Bavaria', 49.4521, 11.0767],
      ['Hanover', 'Lower Saxony', 52.3759, 9.7320],
      ['Bremen', 'Bremen', 53.0793, 8.8017],
    ],
    flavour: {
      food: ['a proper Brotzeit', 'Currywurst', 'Schnitzel', 'fresh pretzels', 'a Sunday Kaffee und Kuchen'],
      places: ['the Christmas market', 'a beer garden', 'the Black Forest', 'a lake', 'the old town'],
      habits: ['cycling everywhere', 'hiking on Sundays', 'football weekends', 'Christmas markets', 'lake swims'],
    },
  },
  FR: {
    name: 'France',
    weight: 0.05,
    cultures: [['fr_white', 0.62], ['fr_black', 0.18], ['fr_north_african', 0.20]],
    military: [['French Army (Armée de Terre)', 'army'], ['French Navy (Marine Nationale)', 'navy'], ['French Air and Space Force', 'air']],
    police: ['Police Nationale', 'Gendarmerie Nationale', 'Préfecture de Police de Paris', 'Police Municipale'],
    paramilitary: ['Gendarmerie Nationale', 'French Customs (Douanes)', 'Sécurité Civile'],
    cities: [
      ['Paris', 'Île-de-France', 48.8566, 2.3522],
      ['Lyon', 'Auvergne-Rhône-Alpes', 45.7640, 4.8357],
      ['Marseille', "Provence-Alpes-Côte d'Azur", 43.2965, 5.3698],
      ['Toulouse', 'Occitanie', 43.6047, 1.4442],
      ['Nice', "Provence-Alpes-Côte d'Azur", 43.7102, 7.2620],
      ['Bordeaux', 'Nouvelle-Aquitaine', 44.8378, -0.5792],
      ['Nantes', 'Pays de la Loire', 47.2184, -1.5536],
      ['Lille', 'Hauts-de-France', 50.6292, 3.0573],
      ['Strasbourg', 'Grand Est', 48.5734, 7.7521],
      ['Montpellier', 'Occitanie', 43.6108, 3.8767],
      ['Rennes', 'Brittany', 48.1173, -1.6778],
      ['Toulon', "Provence-Alpes-Côte d'Azur", 43.1242, 5.9280],
    ],
    flavour: {
      food: ['a proper croissant', 'fresh baguette', 'a long Sunday lunch', 'cheese that smells like a decision', 'crêpes'],
      places: ['the market', 'the coast', 'a village square', 'the mountains', 'a café terrace'],
      habits: ['long lunches', 'cycling', 'market mornings', 'summer festivals', 'coffee on a terrace'],
    },
  },
  IT: {
    name: 'Italy',
    weight: 0.035,
    cultures: [['it_white', 0.94], ['fr_north_african', 0.06]],
    military: [['Italian Army', 'army'], ['Italian Navy', 'navy'], ['Italian Air Force', 'air']],
    police: ['Polizia di Stato', 'Carabinieri', 'Polizia Locale', 'Polizia Penitenziaria'],
    paramilitary: ['Guardia di Finanza', 'Carabinieri', 'Guardia Costiera'],
    cities: [
      ['Rome', 'Lazio', 41.9028, 12.4964],
      ['Milan', 'Lombardy', 45.4642, 9.1900],
      ['Naples', 'Campania', 40.8518, 14.2681],
      ['Turin', 'Piedmont', 45.0703, 7.6869],
      ['Florence', 'Tuscany', 43.7696, 11.2558],
      ['Bologna', 'Emilia-Romagna', 44.4949, 11.3426],
      ['Venice', 'Veneto', 45.4408, 12.3155],
      ['Verona', 'Veneto', 45.4384, 10.9916],
      ['Palermo', 'Sicily', 38.1157, 13.3615],
      ['Genoa', 'Liguria', 44.4056, 8.9463],
      ['Bari', 'Apulia', 41.1171, 16.8719],
      ['Catania', 'Sicily', 37.5079, 15.0830],
    ],
    flavour: {
      food: ['proper carbonara', 'espresso standing at the bar', 'Sunday lunch with family', 'fresh pasta', 'gelato'],
      places: ['the piazza', 'the coast', 'a hill town', 'the market', 'the lake'],
      habits: ['Sunday lunches', 'coastal drives', 'football Sundays', 'summer festivals', 'morning espresso'],
    },
  },
  ES: {
    name: 'Spain',
    weight: 0.03,
    cultures: [['es_white', 0.88], ['us_hispanic', 0.12]],
    military: [['Spanish Army', 'army'], ['Spanish Navy', 'navy'], ['Spanish Air and Space Force', 'air']],
    police: ['Policía Nacional', 'Policía Local', 'Mossos d’Esquadra', 'Ertzaintza'],
    paramilitary: ['Guardia Civil', 'Unidad Militar de Emergencias'],
    cities: [
      ['Madrid', 'Community of Madrid', 40.4168, -3.7038],
      ['Barcelona', 'Catalonia', 41.3874, 2.1686],
      ['Valencia', 'Valencian Community', 39.4699, -0.3763],
      ['Seville', 'Andalusia', 37.3891, -5.9845],
      ['Zaragoza', 'Aragon', 41.6488, -0.8891],
      ['Málaga', 'Andalusia', 36.7213, -4.4214],
      ['Bilbao', 'Basque Country', 43.2630, -2.9350],
      ['Murcia', 'Region of Murcia', 37.9922, -1.1307],
      ['Granada', 'Andalusia', 37.1773, -3.5986],
      ['Palma', 'Balearic Islands', 39.5696, 2.6502],
      ['Alicante', 'Valencian Community', 38.3452, -0.4810],
      ['Valladolid', 'Castile and León', 41.6523, -4.7245],
    ],
    flavour: {
      food: ['late-night tapas', 'proper paella', 'churros with chocolate', 'jamón', 'a long sobremesa'],
      places: ['the beach', 'the old town', 'a tapas bar', 'the mountains', 'the plaza'],
      habits: ['late dinners', 'summer festivals', 'football nights', 'beach days', 'Sunday walks'],
    },
  },
  NL: {
    name: 'Netherlands',
    weight: 0.02,
    cultures: [['nl_white', 0.85], ['nl_black', 0.08], ['fr_north_african', 0.07]],
    military: [['Royal Netherlands Army', 'army'], ['Royal Netherlands Navy', 'navy'], ['Royal Netherlands Air Force', 'air']],
    police: ['National Police (Politie)', 'Royal Marechaussee'],
    paramilitary: ['Royal Marechaussee', 'Dutch Customs', 'Dutch Safety Board'],
    cities: [
      ['Amsterdam', 'North Holland', 52.3676, 4.9041],
      ['Rotterdam', 'South Holland', 51.9244, 4.4777],
      ['The Hague', 'South Holland', 52.0705, 4.3007],
      ['Utrecht', 'Utrecht', 52.0907, 5.1214],
      ['Eindhoven', 'North Brabant', 51.4416, 5.4697],
      ['Groningen', 'Groningen', 53.2194, 6.5665],
      ['Tilburg', 'North Brabant', 51.5555, 5.0913],
      ['Almere', 'Flevoland', 52.3508, 5.2647],
      ['Breda', 'North Brabant', 51.5719, 4.7683],
      ['Nijmegen', 'Gelderland', 51.8126, 5.8372],
    ],
    flavour: {
      food: ['stroopwafels', 'a proper broodje', 'Indonesian rijsttafel', 'fresh herring', 'apple pie'],
      places: ['the canals', 'the beach', 'a brown café', 'the polder', 'the market'],
      habits: ['cycling everywhere', 'canal walks', 'King’s Day', 'field hockey', 'weekend markets'],
    },
  },
  PL: {
    name: 'Poland',
    weight: 0.02,
    cultures: [['pl_white', 1]],
    military: [['Polish Land Forces', 'army'], ['Polish Navy', 'navy'], ['Polish Air Force', 'air']],
    police: ['Policja', 'City Guard (Straż Miejska)'],
    paramilitary: ['Border Guard (Straż Graniczna)', 'Military Gendarmerie', 'State Fire Service'],
    cities: [
      ['Warsaw', 'Masovia', 52.2297, 21.0122],
      ['Kraków', 'Lesser Poland', 50.0647, 19.9450],
      ['Wrocław', 'Lower Silesia', 51.1079, 17.0385],
      ['Gdańsk', 'Pomerania', 54.3520, 18.6466],
      ['Poznań', 'Greater Poland', 52.4064, 16.9252],
      ['Łódź', 'Łódź', 51.7592, 19.4560],
      ['Katowice', 'Silesia', 50.2649, 19.0238],
      ['Szczecin', 'West Pomerania', 53.4285, 14.5528],
      ['Bydgoszcz', 'Kuyavia-Pomerania', 53.1235, 18.0084],
      ['Lublin', 'Lublin', 51.2465, 22.5684],
    ],
    flavour: {
      food: ['proper pierogi', 'żurek', 'a Sunday roast', 'fresh bread', 'oscypek'],
      places: ['the old town', 'the mountains', 'the lake', 'a forest trail', 'the market square'],
      habits: ['mountain hikes', 'Sunday family lunches', 'cycling', 'winter walks', 'summer festivals'],
    },
  },
  PT: {
    name: 'Portugal',
    weight: 0.015,
    cultures: [['pt_white', 0.90], ['pt_black', 0.10]],
    military: [['Portuguese Army', 'army'], ['Portuguese Navy', 'navy'], ['Portuguese Air Force', 'air']],
    police: ['Polícia de Segurança Pública (PSP)', 'Polícia Judiciária'],
    paramilitary: ['Guarda Nacional Republicana (GNR)', 'Serviço de Estrangeiros e Fronteiras'],
    cities: [
      ['Lisbon', 'Lisbon', 38.7223, -9.1393],
      ['Porto', 'Porto', 41.1579, -8.6291],
      ['Braga', 'Braga', 41.5454, -8.4265],
      ['Coimbra', 'Coimbra', 40.2033, -8.4103],
      ['Faro', 'Faro', 37.0194, -7.9304],
      ['Funchal', 'Madeira', 32.6669, -16.9241],
      ['Setúbal', 'Setúbal', 38.5244, -8.8882],
      ['Aveiro', 'Aveiro', 40.6405, -8.6538],
    ],
    flavour: {
      food: ['fresh pastéis de nata', 'bacalhau', 'grilled sardines', 'a proper bifana', 'coffee at the counter'],
      places: ['the beach', 'the old town', 'the market', 'a miradouro', 'the coast road'],
      habits: ['beach days', 'Sunday lunches', 'surfing', 'summer festivals', 'coffee with friends'],
    },
  },
  BR: {
    name: 'Brazil',
    weight: 0.05,
    cultures: [['br_white', 0.45], ['br_mixed', 0.37], ['br_black', 0.18]],
    military: [['Brazilian Army', 'army'], ['Brazilian Navy', 'navy'], ['Brazilian Air Force', 'air']],
    police: ['Polícia Civil', 'Polícia Federal', 'Polícia Rodoviária Federal'],
    paramilitary: ['Polícia Militar', 'Guarda Municipal', 'Corpo de Bombeiros Militar'],
    cities: [
      ['São Paulo', 'São Paulo', -23.5505, -46.6333],
      ['Rio de Janeiro', 'Rio de Janeiro', -22.9068, -43.1729],
      ['Brasília', 'Federal District', -15.7939, -47.8828],
      ['Salvador', 'Bahia', -12.9777, -38.5016],
      ['Fortaleza', 'Ceará', -3.7319, -38.5267],
      ['Belo Horizonte', 'Minas Gerais', -19.9167, -43.9345],
      ['Manaus', 'Amazonas', -3.1190, -60.0217],
      ['Curitiba', 'Paraná', -25.4284, -49.2733],
      ['Recife', 'Pernambuco', -8.0476, -34.8770],
      ['Porto Alegre', 'Rio Grande do Sul', -30.0346, -51.2177],
      ['Belém', 'Pará', -1.4558, -48.4902],
      ['Goiânia', 'Goiás', -16.6869, -49.2648],
    ],
    flavour: {
      food: ['açaí on the beach', 'proper churrasco', 'pão de queijo', 'feijoada', 'fresh coconut water'],
      places: ['the beach', 'the promenade', 'a boteco', 'the market', 'the lagoon'],
      habits: ['beach football', 'Sunday churrasco', 'carnival', 'surfing', 'sunset walks'],
    },
  },
  ZA: {
    name: 'South Africa',
    weight: 0.04,
    cultures: [['za_black', 0.70], ['za_white', 0.14], ['za_coloured', 0.11], ['za_indian', 0.05]],
    military: [['South African Army', 'army'], ['South African Navy', 'navy'], ['South African Air Force', 'air']],
    police: ['South African Police Service (SAPS)', 'Metro Police', 'Directorate for Priority Crime Investigation (Hawks)'],
    paramilitary: ['SAPS Special Task Force', 'SANDF Military Police', 'South African Revenue Service Customs'],
    cities: [
      ['Johannesburg', 'Gauteng', -26.2041, 28.0473],
      ['Cape Town', 'Western Cape', -33.9249, 18.4241],
      ['Durban', 'KwaZulu-Natal', -29.8587, 31.0218],
      ['Pretoria', 'Gauteng', -25.7479, 28.2293],
      ['Port Elizabeth', 'Eastern Cape', -33.9608, 25.6022],
      ['Bloemfontein', 'Free State', -29.0852, 26.1596],
      ['East London', 'Eastern Cape', -33.0292, 27.8546],
      ['Polokwane', 'Limpopo', -23.9045, 29.4689],
      ['Mbombela', 'Mpumalanga', -25.4753, 30.9694],
      ['Kimberley', 'Northern Cape', -28.7282, 24.7499],
    ],
    flavour: {
      food: ['a proper braai', 'biltong', 'bunny chow', 'boerewors', 'malva pudding'],
      places: ['the beach', 'a wine farm', 'the bushveld', 'the mountain', 'a rugby ground'],
      habits: ['braais', 'rugby weekends', 'hiking', 'wine farms', 'beach days'],
    },
  },
  KE: {
    name: 'Kenya',
    weight: 0.01,
    cultures: [['ke_black', 1]],
    military: [['Kenya Army', 'army'], ['Kenya Navy', 'navy'], ['Kenya Air Force', 'air']],
    police: ['Kenya Police Service', 'Administration Police'],
    paramilitary: ['General Service Unit (GSU)', 'Kenya Prisons Service', 'Kenya Wildlife Service'],
    cities: [
      ['Nairobi', 'Nairobi', -1.2921, 36.8219],
      ['Mombasa', 'Mombasa', -4.0435, 39.6682],
      ['Kisumu', 'Kisumu', -0.0917, 34.7680],
      ['Nakuru', 'Nakuru', -0.3031, 36.0800],
      ['Eldoret', 'Uasin Gishu', 0.5143, 35.2698],
      ['Thika', 'Kiambu', -1.0333, 37.0693],
      ['Malindi', 'Kilifi', -3.2192, 40.1169],
    ],
    flavour: {
      food: ['nyama choma', 'ugali and sukuma wiki', 'chapati', 'samosa', 'fresh mango'],
      places: ['the coast', 'a local market', 'the park', 'the hills', 'a café'],
      habits: ['Sunday nyama choma', 'running', 'coastal trips', 'football', 'hiking'],
    },
  },
  GH: {
    name: 'Ghana',
    weight: 0.01,
    cultures: [['gh_black', 1]],
    military: [['Ghana Army', 'army'], ['Ghana Navy', 'navy'], ['Ghana Air Force', 'air']],
    police: ['Ghana Police Service', 'Ghana Immigration Service'],
    paramilitary: ['Ghana Immigration Service', 'Ghana National Fire Service', 'Ghana Prisons Service'],
    cities: [
      ['Accra', 'Greater Accra', 5.6037, -0.1870],
      ['Kumasi', 'Ashanti', 6.6885, -1.6244],
      ['Tamale', 'Northern', 9.4008, -0.8393],
      ['Takoradi', 'Western', 4.8986, -1.7604],
      ['Cape Coast', 'Central', 5.1053, -1.2466],
      ['Tema', 'Greater Accra', 5.6698, -0.0166],
      ['Ho', 'Volta', 6.6008, 0.4713],
    ],
    flavour: {
      food: ['jollof on a Sunday', 'waakye', 'banku and tilapia', 'kelewele', 'fresh kenkey'],
      places: ['the beach', 'the market', 'a chop bar', 'the hills', 'the coast'],
      habits: ['Sunday jollof', 'football', 'beach days', 'market mornings', 'highlife nights'],
    },
  },
};

// -------------------------------------------------------------- skills pools
// Branch-specific trades. A navy persona never gets "Armourer / Armour Corps";
// an air-force persona never gets "Infantry". `byBranch` is checked first.

export const SKILLS_GLOBAL = {
  army: ['Infantry', 'Armour', 'Artillery', 'Combat Engineering', 'Signals', 'Logistics', 'Military Intelligence', 'Medical Corps', 'Military Police', 'Army Aviation', 'Explosive Ordnance Disposal', 'Training'],
  navy: ['Surface Warfare', 'Submarine Service', 'Naval Engineering', 'Naval Aviation', 'Logistics', 'Signals', 'Medical Corps', 'Hydrography', 'Diving', 'Naval Police', 'Cyber Warfare', 'Training'],
  air: ['Flying', 'Air Traffic Control', 'Aircraft Maintenance', 'Avionics', 'Air Defence', 'Logistics', 'Signals', 'Medical Corps', 'Intelligence', 'Cyber', 'Engineering', 'Training'],
  marines: ['Infantry', 'Reconnaissance', 'Amphibious Operations', 'Combat Engineering', 'Signals', 'Logistics', 'Medical Corps', 'Military Police', 'Explosive Ordnance Disposal', 'Training'],
  coast: ['Search and Rescue', 'Maritime Enforcement', 'Navigation', 'Engineering', 'Aviation', 'Logistics', 'Intelligence', 'Cyber', 'Medical Corps', 'Training'],
  police: ['Investigations', 'Forensics', 'Cybercrime', 'Traffic', 'Public Order', 'K9 Handling', 'Community Policing', 'Logistics', 'Prosecution', 'Communications', 'Administration', 'Training'],
  paramilitary: ['Border Operations', 'Customs', 'Corrections', 'Fire and Rescue', 'Emergency Management', 'Security Operations', 'Engineering', 'Logistics', 'Cyber', 'Medical Corps', 'Administration', 'Training'],
};

export const INTERESTS_GLOBAL = [
  'Football', 'Basketball', 'Baseball', 'Rugby', 'Cricket', 'Ice hockey', 'Fitness', 'Running',
  'Swimming', 'Cycling', 'Hiking', 'Camping', 'Surfing', 'Skiing', 'Cooking', 'Baking',
  'Travel', 'Road trips', 'Photography', 'Live music', 'Concerts', 'Jazz', 'Hip-hop', 'Country music',
  'Reading', 'Poetry', 'Chess', 'Board games', 'Video games', 'Anime', 'Podcasts', 'Filmmaking',
  'Art', 'Museums', 'Fashion', 'Volunteering', 'Church', 'Sunday roasts', 'Farmers markets', 'Wine tasting',
  'Coffee', 'Dogs', 'Cats', 'Fishing', 'Boating', 'Dancing', 'Salsa', 'Language learning',
];

// ------------------------------------------------------------ service helpers
/** Weighted pick over [[value, weight], ...] using a [0,1) rng. */
export function pickWeighted(rng, entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Weighted country pick. */
export function pickCountry(rng) {
  return pickWeighted(rng, Object.entries(COUNTRIES).map(([code, c]) => [code, c.weight]));
}

/** Compose a name strictly inside one culture's pools. */
export function buildGlobalName(rng, cultureId, gender) {
  const culture = CULTURES[cultureId];
  if (!culture) throw new Error(`unknown culture: ${cultureId}`);
  const first = culture[gender === 'female' ? 'female' : 'male'][Math.floor(rng() * 12)];
  const last = culture.family[Math.floor(rng() * 12)];
  return `${first} ${last}`;
}

/** Branch kind (army/navy/air/marines/coast) for a military persona. */
export function pickBranch(rng, country) {
  const entries = country.military.map(([, kind], i) => [
    kind,
    kind === 'army' ? 0.45 : kind === 'air' ? 0.22 : kind === 'navy' ? 0.18 : kind === 'marines' ? 0.10 : 0.05,
  ]);
  return pickWeighted(rng, entries);
}

export const BRANCH_LABEL = { army: 'Army', navy: 'Navy', air: 'Air Force', marines: 'Marines', coast: 'Coast Guard' };

