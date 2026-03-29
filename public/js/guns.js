export const GUNS = [
  { id: 1, name: "Pistol", damage: 25, rpm: 180, range: 1200, reloadTime: 1.2, magazine: 12, spreadDeg: 2, type: "semi" },
  { id: 2, name: "Assault Rifle", damage: 18, rpm: 600, range: 1600, reloadTime: 1.8, magazine: 30, spreadDeg: 4, type: "auto" },
  { id: 3, name: "Shotgun", damage: 90, rpm: 75, range: 400, reloadTime: 2.2, magazine: 6, spreadDeg: 18, type: "semi" },
  { id: 4, name: "Sniper Rifle", damage: 95, rpm: 45, range: 3200, reloadTime: 2.8, magazine: 5, spreadDeg: 0.2, type: "semi" },
  { id: 5, name: "SMG", damage: 12, rpm: 900, range: 900, reloadTime: 1.4, magazine: 40, spreadDeg: 6, type: "auto" },
  { id: 6, name: "LMG", damage: 20, rpm: 450, range: 1400, reloadTime: 4.0, magazine: 100, spreadDeg: 8, type: "auto" },
  { id: 7, name: "Rocket Launcher", damage: 120, rpm: 30, range: 1800, reloadTime: 3.5, magazine: 3, spreadDeg: 1, type: "semi" },
  { id: 8, name: "Grenade Launcher", damage: 70, rpm: 60, range: 1000, reloadTime: 2.5, magazine: 6, spreadDeg: 3, type: "semi" }
];

export function getGun(gunId) {
  return GUNS.find((gun) => gun.id === Number(gunId)) || GUNS[0];
}

function statBar(current, max) {
  const blocks = 8;
  const filled = Math.max(1, Math.round((current / max) * blocks));
  return `${"█".repeat(filled)}${"░".repeat(blocks - filled)}`;
}

export function renderGunCarousel(container, selectedGunId, onSelect) {
  container.innerHTML = "";
  for (const gun of GUNS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `gun-card ${selectedGunId === gun.id ? "selected" : ""}`;
    card.innerHTML = `
      <strong>${gun.name}</strong>
      <span>DMG ${statBar(gun.damage, 120)}</span>
      <span>RPM ${statBar(gun.rpm, 900)}</span>
      <span>RNG ${statBar(Math.min(gun.range, 1800), 1800)}</span>
      <span>RLD ${gun.reloadTime.toFixed(1)}s</span>
      <span>MAG ${gun.magazine}</span>
    `;
    card.addEventListener("click", () => onSelect(gun.id));
    container.appendChild(card);
  }
}
