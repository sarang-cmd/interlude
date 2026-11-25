import { AI_LEVELS } from "../src/ai/difficulty";
import { PongLogic } from "../src/games/pong/logic";

const step = 1 / 60;
for (const level of AI_LEVELS) {
  let wins = 0;
  let unfinished = 0;
  let elapsed = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const game = new PongLogic({ seed, difficulty: level, firstTo: 5 });
    let time = 0;
    while (game.alive && time < 120) {
      const target = game.ball.y - 42 + (game.ball.vx < 0 ? 35 : 0);
      const delta = target - game.playerY;
      game.nudgePlayer(Math.sign(delta) * Math.min(Math.abs(delta), 380 * step));
      game.update(step);
      time += step;
    }
    if (game.winner === "player") wins++;
    if (game.alive) unfinished++;
    elapsed += time;
  }
  console.log(
    `${level}: ${wins}/25 wins, ${unfinished} unfinished, ${(elapsed / 25).toFixed(1)}s mean`,
  );
}
