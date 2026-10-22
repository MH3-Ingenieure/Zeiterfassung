// Microsoft-365-Konfiguration
// Alle drei Werte leer lassen = die App arbeitet nur lokal auf dem Gerät (ohne Anmeldung).
window.APP_CONFIG = {
  tenantId: '',  // Verzeichnis-ID (Mandanten-ID) aus der App-Registrierung in Entra ID
  clientId: '',  // Anwendungs-ID (Client-ID) aus der App-Registrierung in Entra ID
  siteUrl: '',   // Adresse der SharePoint-Website, z. B. 'https://firma.sharepoint.com/sites/Zeiterfassung'
  // Optional – Diktieren mit dem Microsoft Azure Sprachdienst (leer = Diktierfunktion des Geräts)
  speechRegion: '',     // Region des Sprachdienstes, z. B. 'westeurope' oder 'germanywestcentral'
  speechResourceId: ''  // Ressourcen-ID des Sprachdienstes (Azure-Portal → Sprachdienst → Eigenschaften), beginnt mit '/subscriptions/'
};
