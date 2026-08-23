assetlinks.json goes here.

PWABuilder already generated it — it is inside the Android package zip you
downloaded. Copy that file in beside this one, deploy, and Google will verify
that the Android app is allowed to open this domain without a browser bar.

It is NOT secret. It contains only the package name and the public SHA-256
fingerprint of the signing certificate, and Google fetches it unauthenticated.
The keystore that fingerprint came from IS secret and must never be committed.

Verify after deploying:
  curl https://tuition-register-delta.vercel.app/.well-known/assetlinks.json
