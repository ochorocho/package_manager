<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Exception;

/**
 * Exception thrown when composer binary cannot be found or downloaded
 */
class ComposerNotFoundException extends \RuntimeException {}
