document.addEventListener("DOMContentLoaded", function () {

    // --- CREA LA MAPPA ---
    var map = L.map('map').setView([0, 0], 2);
    let marker;

    // Rende la variabile accessibile da altri file se serve
    window.map = map;

    // --- TILE LAYER ---
    L.tileLayer('https://api.maptiler.com/maps/ocean/{z}/{x}/{y}.png?key=SqqMN2hTujTCVJBpdgQr', {
        attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a>'
    }).addTo(map);

    // --- COORDINATE DISPLAY ---
    L.control.coordinates({
        position: "bottomleft",
        useDMS: true,
        labelTemplateLat: "Lat {y}",
        labelTemplateLng: "Long {x}",
        useLatLngOrder: true
    }).addTo(map);

    // FUNZIONE: elimina marker precedente
    window.eliminaMarker = function (m) {
        if (m) map.removeLayer(m);
    };

    // --- CLICK SULLA MAPPA ---
    map.on("click", function (e) {

        eliminaMarker(marker);
        marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);

        let lat = e.latlng.lat;
        let lng = ((e.latlng.lng + 180) % 360 + 360) % 360 - 180;

        console.log("Latitudine:", lat, "\nLongitudine:", lng);

        // LIMITI bordi API
        if (lat > 82 || lat < -82) {
            L.popup()
                .setLatLng([lat, lng])
                .setContent("Area fuori copertura dei dati marini")
                .openOn(map);
            return;
        }

        // --- CHIAMATA API ---
        getMarineWeather(lat, lng).then(data => {
            if (!data || !data.current || data.current.sea_surface_temperature === null) {
                L.popup()
                    .setLatLng([lat, lng])
                    .setContent("Indicami una superficie marittima")
                    .openOn(map);
                return;
            }
            //Conoscere corpo marino in questione -> chiamata API per ragioni di efficienza -> scelta per cui si è optato
            let nome;
            let nomeAcqua = null;
            ottieniNomeOceano_GeoNames(lat, lng, 'l.azzalin')
              .then(nome => {
                nomeAcqua = nome;
                //SISTEMARE SINTASSI var html
                const c = data.current;
                const nd = v => (v == null ? "dato sconosciuto" : v);
                const html = `
                    <b>Dati Meteo-Marini Attuali</b><br><br>
                    <b>Geolocalizzazione</b> ${nomeAcqua}<br>
                    <b>Altezza onda</b>: ${nd(c.wave_height)} m<br>
                    <b>Direzione onda</b>: ${nd(c.wave_direction)}°<br><br>
                    <b>Direzione delle onde generate dal vento</b>: ${nd(c.wind_wave_direction)}&deg;<br>
                    <b>Periodo delle onde generate dal vento</b>: ${nd(c.wind_wave_period)} s<br><br>
                    <b>Temperatura della superficie del mare</b>: ${nd(c.sea_surface_temperature)} &deg;C<br>
                    <b>Altezza del livello del mare (MSL)</b>: ${nd(c.sea_level_height_msl)} m<br><br>
                    <b>Direzione corrente oceanica</b>: ${nd(c.ocean_current_direction)}°<br>
                    <b>Velocità corrente oceano</b>: ${nd(c.ocean_current_velocity)} m/s<br>
                `;
                L.popup()
                    .setLatLng([lat, lng])
                    .setContent(html)
                    .openOn(map);

                //Esegue un controllo per vedere se si è in un browser o in una webview, e in caso invia i dati a java
                inviaDatiAlJava(lat, lng, data, nomeAcqua);
              }).catch(errore => console.error(errore));
        });
    });

    // --- FUNZIONE PER L'API OPEN METEO ---
    async function getMarineWeather(lat, lon) {
        const baseUrl = 'https://marine-api.open-meteo.com/v1/marine';
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            hourly: [
                'wave_height','wave_direction','wave_period','wave_peak_period',
                'wind_wave_height','wind_wave_direction',
                'swell_wave_height','swell_wave_direction'
            ].join(','),
            current: [
                'wave_height','wave_direction',
                'wind_wave_height','wind_wave_direction','wind_wave_period',
                'sea_surface_temperature','sea_level_height_msl',
                'ocean_current_direction','ocean_current_velocity'
            ].join(',')
        });
        const url = `${baseUrl}?${params.toString()}`;
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Errore HTTP! status: ${resp.status}`);
            const data = await resp.json();
            console.log("Dati meteo marino");
            console.log(data);
            return data;
        } catch (err) {
            console.error("Errore durante la richiesta Open-Meteo:", err);
        }
    }
});

//Funzione per il passaggio dei miei alla webview java
function inviaDatiAlJava(lat, lng, data, localita) {
    //append di localita a data per geolocalizzazione
    const dataConLocalita = {
        ...data,
        localita: localita || null
    };
    const meteoJson = JSON.stringify(dataConLocalita);
    //console.log("MeteoJSON: " +  meteoJson);
    if (window.AndroidBridge && typeof window.AndroidBridge.riceviDati === "function") {
        AndroidBridge.riceviDati(lat.toString(), lng.toString(), meteoJson);
    } else {
        console.log("AndroidBridge non disponibile, probabilmente sei in browser");
    }
}

//Funzione per conoscere corpo marino
async function ottieniNomeOceano_GeoNames(latitudine, longitudine, nomeUtente) {
  const url = `http://api.geonames.org/oceanJSON?lat=${encodeURIComponent(latitudine)}&lng=${encodeURIComponent(longitudine)}&username=${encodeURIComponent(nomeUtente)}`;
  const risposta = await fetch(url);
  if (!risposta.ok) throw new Error('Errore GeoNames: ' + risposta.status);
  const datiJson = await risposta.json();
  // datiJson.ocean.name contiene il nome, se presente
  return datiJson.ocean ? datiJson.ocean.name : null;
}
