import { praxis } from "@praxis-ai/praxis";
import type { BaseToolPolicyMatrixSpec } from "@praxis-ai/praxis";

import type { RaxodePolicyProfile } from "../config/raxodeOptions.js";

export function createRaxodeToolPolicy(profile: RaxodePolicyProfile): BaseToolPolicyMatrixSpec {
  if (profile === "restricted") return praxis.toolPolicies.restricted({ matrixId: "toolPolicy.raxode.restricted" });
  if (profile === "permissive") return praxis.toolPolicies.permissive({ matrixId: "toolPolicy.raxode.permissive" });
  if (profile === "yolo") return praxis.toolPolicies.yolo({ matrixId: "toolPolicy.raxode.yolo" });
  if (profile === "bapr") return praxis.toolPolicies.bapr({ matrixId: "toolPolicy.raxode.bapr" });
  return praxis.toolPolicies.standard({ matrixId: "toolPolicy.raxode.standard" });
}

