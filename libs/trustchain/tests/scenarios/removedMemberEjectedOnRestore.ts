import Transport from "@ledgerhq/hw-transport";
import { TrustchainEjected } from "../../src/errors";
import { ScenarioOptions } from "../test-helpers/types";

export async function scenario(transport: Transport, { sdkForName }: ScenarioOptions) {
  // first member initializes itself
  const name1 = "Member 1";
  const sdk1 = sdkForName(name1);
  const member1creds = await sdk1.initMemberCredentials();

  // auth with the device and init the first trustchain
  const { trustchain } = await sdk1.getOrCreateTrustchain(transport, member1creds);

  // second member initializes itself
  const name2 = "Member 2";
  const sdk2 = sdkForName(name2);
  const member2creds = await sdk2.initMemberCredentials();

  // member 1 adds member 2 (= qr code flow)
  const member2 = { name: name2, id: member2creds.pubkey, permissions: 0xffffffff };
  await sdk1.addMember(trustchain, member1creds, member2);

  // member1 removes member2
  const newTrustchain = await sdk1.removeMember(transport, trustchain, member1creds, member2);

  // now member2 will get an ejected error when trying to restore the trustchain
  // NB: restoreTrustchain is typically what we would call when member2 see that the encryptionKey no longer work after the rotation
  await expect(sdk2.restoreTrustchain(trustchain, member2creds)).rejects.toThrow(TrustchainEjected);

  // member3 destroy the trustchain
  await sdk1.destroyTrustchain(newTrustchain, member1creds);
}
