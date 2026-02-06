<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Exception;

/**
 * Exception thrown when attempting to remove a protected package
 */
class PackageProtectedException extends \RuntimeException {}
