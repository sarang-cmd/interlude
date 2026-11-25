import { AI_LEVELS, AI_PROFILES } from "../src/ai/difficulty";
import { solveThree } from "../src/ai/three-in-row";
import { TicTacToeLogic } from "../src/games/tictactoe/logic";
import { RNG } from "../src/shared/rng";

// Random X versus the configured O. This measures one artificial opponent,
// not human game feel. Use separate seeded generators for the two sides.
for (const level of AI_LEVELS) {
  const counts = { cpu: 0, player: 0, draw: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const game = new TicTacToeLogic();
    const player = new RNG(seed);
    const cpu = new RNG(seed * 997);
    while (game.outcome === "playing") {
      const position = game.position;
      let move: number;
      if (position.turn === 1) move = player.pick(game.legalMoves);
      else {
        const profile = AI_PROFILES[level];
        const result = solveThree({
          kind: "three-in-row",
          position,
          method: "minimax",
          depth: profile.searchDepth,
          maxNodes: 100_000,
          simulations: profile.simulations,
          seed: Math.floor(cpu.next() * 0x100000000),
        });
        move = cpu.chance(profile.errorChance) ? cpu.pick(game.legalMoves) : result.move!;
      }
      if (!game.move(move)) throw new Error("Simulation selected an illegal move");
    }
    if (game.outcome === "x") counts.player++;
    else if (game.outcome === "o") counts.cpu++;
    else counts.draw++;
  }
  console.log(`${level}: CPU ${counts.cpu}, player ${counts.player}, draws ${counts.draw}`);
}
