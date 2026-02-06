<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Http;

/**
 * Tiny helper around `$request->getParsedBody()` that gives the controller
 * type-safe accessors and centralizes the awkward bool coercion needed
 * because JSON-decoded bodies sometimes deliver booleans as strings.
 */
final readonly class RequestInput
{
    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        private array $data,
    ) {}

    public static function fromBody(mixed $body): self
    {
        return new self(is_array($body) ? $body : []);
    }

    public function getString(string $key, string $default = ''): string
    {
        $value = $this->data[$key] ?? null;
        if (!is_scalar($value)) {
            return $default;
        }
        return trim((string)$value);
    }

    /**
     * Returns the boolean value of `$key`. Accepts the string forms
     * "true"/"false" (which is what `JSON.stringify(true)` round-trips to
     * via `application/x-www-form-urlencoded`), real bool, or the integers
     * 0/1.
     */
    public function getBool(string $key, bool $default = false): bool
    {
        $value = $this->data[$key] ?? null;
        if ($value === null) {
            return $default;
        }
        if (is_bool($value)) {
            return $value;
        }
        if (is_string($value)) {
            return match (strtolower($value)) {
                'true', '1', 'yes', 'on' => true,
                'false', '0', 'no', 'off', '' => false,
                default => $default,
            };
        }
        if (is_int($value)) {
            return $value !== 0;
        }
        return $default;
    }

    /**
     * @return array<string, mixed>
     */
    public function getArray(string $key): array
    {
        $value = $this->data[$key] ?? null;
        return is_array($value) ? $value : [];
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->data);
    }
}
