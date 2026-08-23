Put phone captures of the app here, then run `npm run screenshots`.

Name them after the screen, with an order prefix:

    01-today.png
    02-plan.png
    03-reports.png
    04-students.png

The script reads each file's real dimensions and writes the correct
`sizes` and `form_factor` into public/manifest.webmanifest. Portrait
images are tagged `narrow` (phone), landscape `wide` (desktop) — Play
and the browser install prompt show different sets.

Capture them on an actual phone with real data on screen. Play rejects
listings whose screenshots do not match the app.
