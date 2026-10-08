# Enable generated manager messages

“Template suggestions shown. Configure Gemini for generated wording.” means the backend selected its offline mock provider. It is not a phone or notification error.

1. Create a key using [Google's Gemini API key guide](https://ai.google.dev/gemini-api/docs/api-key).
2. From the project root, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/configure-gemini.ps1
   ```

   Paste the key into the hidden prompt. The command saves it in `backend/.env`, which Git ignores, and enables Gemini for both incident analysis and manager message suggestions. Existing unrelated settings and model overrides are preserved. Do not paste the key into chat or the mobile app.
   If the hidden prompt does not accept pasting, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/configure-gemini.ps1 -FromClipboard
   ```

   Wait for the prompt, then copy only the key from Google AI Studio. Return to the terminal and press Enter without pasting. The script reads the clipboard without displaying the key. Copy the key **after** running the command so copying the command does not replace it.

3. Stop the existing backend with Ctrl+C. In a fresh terminal at the project root, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -Lan
   ```

4. Reopen the incident in the manager app to request new suggestions. Successful Gemini drafts show “Suggested by Gemini.” The manager still reviews and sends the messages. No APK rebuild is required.

The backend loads this file at startup even when launched directly with Uvicorn. Explicit terminal environment variables override the file; remove any old `PULSE_AI_MODE=mock` or `PULSE_ALERT_PROVIDER=mock` environment settings if templates persist. The phone must connect to the backend you configured.

A key or model error is reported as an error, rather than silently using templates. Without a saved key or explicit Gemini configuration, offline template mode remains available.

## Empty or invalid alert drafts

The previous alert request allowed only 300–1200 output tokens. Requests now allow at least 8192 tokens for reasoning and the structured answer, while the prompt still requires short messages. Analysis uses the same 8192-token allowance. See Google's [generation configuration reference](https://ai.google.dev/api/generate-content) for `maxOutputTokens`.

The backend now distinguishes token-limit truncation (`MAX_TOKENS`), blocked responses, absent candidates, absent answer text, and malformed JSON. It never sends a partial response. Restart the backend to load these changes; no APK rebuild is needed. This fixes the small request budget, but the exact cause of a previous generic error cannot be recovered without the original provider response. Local regression tests simulate these responses; live verification requires a key in the backend environment.
