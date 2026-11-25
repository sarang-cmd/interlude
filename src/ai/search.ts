import type { RNG } from "../shared/rng";

/** Scores are always from the root player's perspective. States must be immutable. */
export interface SearchRules<State, Move> {
  moves(state: State): readonly Move[];
  apply(state: State, move: Move): State;
  terminal(state: State): number | null;
  evaluate(state: State): number;
}
export interface SearchResult<Move> {
  move: Move | null;
  score: number;
  nodes: number;
  complete: boolean;
}

function boundedInt(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : minimum;
}

/** Alpha-beta minimax with a hard node budget and deterministic tie-breaking. */
export function minimax<State, Move>(
  state: State,
  rules: SearchRules<State, Move>,
  options: { depth: number; maxNodes: number },
): SearchResult<Move> {
  const depth = boundedInt(options.depth, 1, 32);
  const maxNodes = boundedInt(options.maxNodes, 1, 1_000_000);
  let nodes = 0;
  let complete = true;

  const visit = (
    node: State,
    left: number,
    maximizing: boolean,
    alpha: number,
    beta: number,
  ): number => {
    if (nodes >= maxNodes) {
      complete = false;
      return rules.evaluate(node);
    }
    nodes++;
    const terminal = rules.terminal(node);
    if (terminal !== null) return terminal;
    if (left === 0) return rules.evaluate(node);
    const moves = rules.moves(node);
    if (!moves.length) return rules.evaluate(node);
    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
      const score = visit(rules.apply(node, move), left - 1, !maximizing, alpha, beta);
      best = maximizing ? Math.max(best, score) : Math.min(best, score);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha || !complete) break;
    }
    return best;
  };

  const terminal = rules.terminal(state);
  if (terminal !== null) return { move: null, score: terminal, nodes: 1, complete: true };
  const moves = rules.moves(state);
  if (!moves.length) return { move: null, score: rules.evaluate(state), nodes: 1, complete: true };
  let bestMove: Move = moves[0]!;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const move of moves) {
    const score = visit(rules.apply(state, move), depth - 1, false, alpha, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, bestScore);
    if (!complete) break;
  }
  return { move: bestMove, score: bestScore, nodes, complete };
}

/** Seeded, round-robin random playouts. Work is capped by simulations and playout length. */
export function monteCarlo<State, Move>(
  state: State,
  rules: SearchRules<State, Move>,
  rng: RNG,
  options: { simulations: number; maxPlayout: number },
): SearchResult<Move> {
  const terminal = rules.terminal(state);
  if (terminal !== null) return { move: null, score: terminal, nodes: 1, complete: true };
  const moves = rules.moves(state);
  if (!moves.length) return { move: null, score: rules.evaluate(state), nodes: 1, complete: true };
  const simulations = boundedInt(options.simulations, 1, 100_000);
  const maxPlayout = boundedInt(options.maxPlayout, 1, 512);
  const totals = moves.map(() => 0);
  const visits = moves.map(() => 0);
  let nodes = 0;
  for (let iteration = 0; iteration < simulations; iteration++) {
    const index = iteration % moves.length;
    let position = rules.apply(state, moves[index]!);
    nodes++;
    let outcome = rules.terminal(position);
    for (let step = 0; outcome === null && step < maxPlayout; step++) {
      const choices = rules.moves(position);
      if (!choices.length) break;
      position = rules.apply(position, choices[rng.int(0, choices.length - 1)]!);
      nodes++;
      outcome = rules.terminal(position);
    }
    totals[index]! += outcome ?? rules.evaluate(position);
    visits[index]!++;
  }
  let best = 0;
  for (let index = 1; index < moves.length; index++) {
    if (visits[index] && totals[index]! / visits[index]! > totals[best]! / visits[best]!)
      best = index;
  }
  return { move: moves[best]!, score: totals[best]! / visits[best]!, nodes, complete: true };
}
