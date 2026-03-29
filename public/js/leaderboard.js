export function renderLeaderboard(container, result, selfToken) {
  const rows = result?.leaderboard || [];
  const awards = rows.reduce(
    (summary, row) => {
      if (!summary.kills || row.kills > summary.kills.kills) summary.kills = row;
      if (!summary.damage || row.damage > summary.damage.damage) summary.damage = row;
      if (!summary.deaths || row.deaths < summary.deaths.deaths) summary.deaths = row;
      return summary;
    },
    { kills: null, damage: null, deaths: null }
  );

  container.innerHTML = `
    <div class="modal-card leaderboard-card">
      <h2>Match Over</h2>
      <p class="leaderboard-winner">Winner: ${result?.winner || "No winner"}</p>
      <table class="leaderboard-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>K/D</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `
              <tr class="${row.playerId === selfToken.slice(-8) ? "self" : ""} ${row.rank <= 3 ? `podium-${row.rank}` : ""}">
                <td>${row.rank}</td>
                <td>${row.name}</td>
                <td>${row.kills}</td>
                <td>${row.deaths}</td>
                <td>${row.damage}</td>
                <td>${row.kd}</td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
      <div class="leaderboard-awards">
        <div>Most Kills: ${awards.kills ? `${awards.kills.name} (${awards.kills.kills})` : "--"}</div>
        <div>Most Damage: ${awards.damage ? `${awards.damage.name} (${awards.damage.damage})` : "--"}</div>
        <div>Least Deaths: ${awards.deaths ? `${awards.deaths.name} (${awards.deaths.deaths})` : "--"}</div>
      </div>
      <div class="modal-actions">
        <button id="playAgainBtn" class="primary">Play Again</button>
        <button id="backLobbyBtn">Back to Lobby</button>
        <button id="mainMenuBtn">Main Menu</button>
      </div>
    </div>
  `;
}
