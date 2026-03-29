export function launchConfetti(container) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:150;width:100%;height:100%";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#ffb800", "#00ff88", "#ff3344", "#7dd3fc", "#c084fc", "#f97316"];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 200,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    size: 6 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.2
  }));
  let frame;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let anyAlive = false;
    for (const piece of pieces) {
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += 0.06;
      piece.rot += piece.rotV;
      if (piece.y < canvas.height + 30) anyAlive = true;
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rot);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    }
    if (anyAlive) {
      frame = requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  };
  frame = requestAnimationFrame(animate);
  setTimeout(() => {
    cancelAnimationFrame(frame);
    canvas.remove();
  }, 6000);
}

export function renderLeaderboard(container, result, selfToken, selfTeam) {
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

  const teamWinner = selfTeam === "red" ? "Team Red" : selfTeam === "blue" ? "Team Blue" : null;
  if (rows[0]?.playerId === selfToken.slice(-8) || (teamWinner && result?.winner === teamWinner)) {
    setTimeout(() => launchConfetti(document.body), 400);
  }
}
