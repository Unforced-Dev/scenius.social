import {
  JoseKey,
  Keyset,
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
} from "@atproto/oauth-client-node";
import type {
  NodeSavedSession,
  NodeSavedState,
  OAuthClientMetadataInput,
} from "@atproto/oauth-client-node";
import { db } from "../db";
import { authState, authSession } from "../db/schema";
import { eq } from "drizzle-orm";

export const SCOPE = "atproto";

let client: NodeOAuthClient | null = null;

const PUBLIC_URL = process.env.PUBLIC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

function getClientMetadata(): OAuthClientMetadataInput {
  if (PUBLIC_URL) {
    return {
      client_id: `${PUBLIC_URL}/oauth-client-metadata.json`,
      client_name: "scenius.social",
      client_uri: PUBLIC_URL,
      redirect_uris: [`${PUBLIC_URL}/oauth/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPE,
      token_endpoint_auth_method: "private_key_jwt" as const,
      token_endpoint_auth_signing_alg: "ES256" as const,
      jwks_uri: `${PUBLIC_URL}/.well-known/jwks.json`,
      dpop_bound_access_tokens: true,
    };
  } else {
    return buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: ["http://127.0.0.1:3000/oauth/callback"],
    });
  }
}

async function getKeyset(): Promise<Keyset | undefined> {
  if (PUBLIC_URL && PRIVATE_KEY) {
    return new Keyset([await JoseKey.fromJWK(JSON.parse(PRIVATE_KEY))]);
  }
  return undefined;
}

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client;

  client = new NodeOAuthClient({
    clientMetadata: getClientMetadata(),
    keyset: await getKeyset(),

    stateStore: {
      async get(key: string) {
        const [row] = await db
          .select({ value: authState.value })
          .from(authState)
          .where(eq(authState.key, key));
        return row ? JSON.parse(row.value) : undefined;
      },
      async set(key: string, value: NodeSavedState) {
        const valueJson = JSON.stringify(value);
        await db
          .insert(authState)
          .values({ key, value: valueJson })
          .onConflictDoUpdate({
            target: authState.key,
            set: { value: valueJson },
          });
      },
      async del(key: string) {
        await db.delete(authState).where(eq(authState.key, key));
      },
    },

    sessionStore: {
      async get(key: string) {
        const [row] = await db
          .select({ value: authSession.value })
          .from(authSession)
          .where(eq(authSession.key, key));
        return row ? JSON.parse(row.value) : undefined;
      },
      async set(key: string, value: NodeSavedSession) {
        const valueJson = JSON.stringify(value);
        await db
          .insert(authSession)
          .values({ key, value: valueJson })
          .onConflictDoUpdate({
            target: authSession.key,
            set: { value: valueJson },
          });
      },
      async del(key: string) {
        await db.delete(authSession).where(eq(authSession.key, key));
      },
    },
  });

  return client;
}
