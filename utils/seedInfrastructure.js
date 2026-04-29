// utils/seedInfrastructure.js
// Lance ce script UNE SEULE FOIS pour pré-charger les 3 plateformes et 12 CLR
// Commande : node utils/seedInfrastructure.js

const { sequelize, Plateforme, CLR } = require('../models');

const PLATEFORMES = [
  { id: 1, nom: 'Plateforme Est',    region: 'EST',    ville: 'Khroub (Constantine)', capacite: 3500  },
  { id: 2, nom: 'Plateforme Ouest',  region: 'OUEST',  ville: 'Oran',                 capacite: 8800  },
  { id: 3, nom: 'Plateforme Centre', region: 'CENTRE', ville: 'Bouira',               capacite: 20000 },
];

const CLRS = [
  // ── EST (rattachés à Plateforme Est, id:1) ──
  { code: 'R05', nom: 'CLR Batna',       wilaya: 'Batna',       region: 'EST',    plateformeId: 1 },
  { code: 'R19', nom: 'CLR Sétif',       wilaya: 'Sétif',       region: 'EST',    plateformeId: 1 },

  // ── CENTRE (rattachés à Plateforme Centre, id:3) ──
  { code: 'R09', nom: 'CLR Blida',       wilaya: 'Blida',       region: 'CENTRE', plateformeId: 3 },
  { code: 'R15', nom: 'CLR Tizi Ouzou',  wilaya: 'Tizi Ouzou',  region: 'CENTRE', plateformeId: 3 },
  { code: 'R16', nom: 'CLR Médéa',       wilaya: 'Médéa',       region: 'CENTRE', plateformeId: 3 },
  { code: 'R26', nom: 'CLR Bouira',      wilaya: 'Bouira',      region: 'CENTRE', plateformeId: 3 },
  { code: 'R48', nom: 'CLR Relizane',    wilaya: 'Relizane',    region: 'CENTRE', plateformeId: 3 },

  // ── OUEST (rattachés à Plateforme Ouest, id:2) ──
  { code: 'R13', nom: 'CLR Tlemcen',     wilaya: 'Tlemcen',     region: 'OUEST',  plateformeId: 2 },
  { code: 'R22', nom: 'CLR Sidi B. Abbès', wilaya: 'Sidi B. Abbès', region: 'OUEST', plateformeId: 2 },
  { code: 'R27', nom: 'CLR Mostaganem',  wilaya: 'Mostaganem',  region: 'OUEST',  plateformeId: 2 },
  { code: 'R29', nom: 'CLR Mascara',     wilaya: 'Mascara',     region: 'OUEST',  plateformeId: 2 },
  { code: 'R31', nom: 'CLR Oran',        wilaya: 'Oran',        region: 'OUEST',  plateformeId: 2 },
];

async function seed() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true }); // crée les nouvelles tables sans détruire l'existant

    console.log('📦 Insertion des plateformes...');
    for (const p of PLATEFORMES) {
      await Plateforme.findOrCreate({ where: { id: p.id }, defaults: p });
      console.log(`   ✅ ${p.nom} (${p.capacite} palettes)`);
    }

    console.log('\n🏭 Insertion des CLR...');
    for (const c of CLRS) {
      await CLR.findOrCreate({ where: { code: c.code }, defaults: c });
      console.log(`   ✅ ${c.code} — ${c.nom} [${c.region}]`);
    }

    console.log('\n🎉 Infrastructure pré-chargée avec succès !');
    console.log(`   → ${PLATEFORMES.length} plateformes`);
    console.log(`   → ${CLRS.length} CLR`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur seed :', err.message);
    process.exit(1);
  }
}

seed();
