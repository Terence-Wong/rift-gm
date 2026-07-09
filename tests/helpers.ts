import type {
  Attributes,
  PlayerMatchInput,
  Role,
  TeamContext,
  TeamTactics,
} from "../lib/types";
import { ROLES } from "../lib/types";

export function flatAttributes(value: number, overrides: Partial<Attributes> = {}): Attributes {
  return {
    laning: value,
    mechanics: value,
    macro: value,
    teamfight: value,
    aggression: value,
    consistency: value,
    clutch: value,
    potential: value,
    ...overrides,
  };
}

export function syntheticPlayer(
  id: string,
  role: Role,
  attrs: Attributes,
): PlayerMatchInput {
  return {
    id,
    handle: id,
    role,
    attributes: attrs,
    form: 0,
    morale: 60,
    fatigue: 0,
  };
}

export const NEUTRAL_TACTICS: TeamTactics = {
  playstyle: "BALANCED",
  objective: "DRAGON",
  archetype: "TEAMFIGHT",
};

export function syntheticTeam(
  teamId: string,
  attrValue: number,
  overrides: Partial<Attributes> = {},
  tactics: TeamTactics = NEUTRAL_TACTICS,
): TeamContext {
  return {
    teamId,
    name: teamId,
    players: ROLES.map((role) =>
      syntheticPlayer(`${teamId}-${role}`, role, flatAttributes(attrValue, overrides)),
    ),
    tactics,
  };
}
