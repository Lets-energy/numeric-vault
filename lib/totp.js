/**
 * TOTP RFC 6238 implementation
 */
export const TOTP = {
    // Decodifica base32 para Uint8Array
    base32Decode(s) {
        const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        s = s.toUpperCase().replace(/=+$/, '');
        let bits = 0, val = 0;
        const out = [];
        for (const c of s) {
            val = (val << 5) | alpha.indexOf(c);
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                out.push((val >> bits) & 0xff);
            }
        }
        return new Uint8Array(out);
    },

    // HMAC-SHA1
    async hmacSHA1(keyBytes, msgBytes) {
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
        return new Uint8Array(sig);
    },

    // Gera código TOTP para o momento atual (ou offset de steps)
    async generate(secret, step = 0) {
        const T = Math.floor(Date.now() / 1000 / 30) + step;
        const msg = new Uint8Array(8);
        let t = T;
        for (let i = 7; i >= 0; i--) {
            msg[i] = t & 0xff;
            t >>= 8;
        }
        const key = this.base32Decode(secret);
        const hash = await this.hmacSHA1(key, msg);
        const offset = hash[19] & 0x0f;
        const code =
            ((hash[offset] & 0x7f) << 24 |
                hash[offset + 1] << 16 |
                hash[offset + 2] << 8 |
                hash[offset + 3]) %
            1000000;
        return String(code).padStart(6, '0');
    },

    // Verifica código — aceita janela de ±1 step (30s de tolerância)
    async verify(secret, token) {
        for (const step of [0, -1, 1]) {
            if ((await this.generate(secret, step)) === token) return true;
        }
        return false;
    },

    // Gera secret aleatório em base32
    randomSecret() {
        const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let s = '';
        const arr = crypto.getRandomValues(new Uint8Array(20));
        for (const b of arr) s += alpha[b % 32];
        return s;
    },

    // URL para QR Code
    otpauthURL(secret, account, issuer = 'OrcaFácil') {
        return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
            account
        )}?secret=${secret}&issuer=${encodeURIComponent(
            issuer
        )}&algorithm=SHA1&digits=6&period=30`;
    },
};
