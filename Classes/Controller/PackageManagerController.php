<?php

declare(strict_types=1);

namespace Ochorocho\PackageManager\Controller;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Backend\Attribute\AsController;
use TYPO3\CMS\Backend\Template\ModuleTemplateFactory;
use TYPO3\CMS\Core\Page\PageRenderer;

#[AsController]
readonly class PackageManagerController
{
    public function __construct(
        private ModuleTemplateFactory $moduleTemplateFactory,
        private PageRenderer $pageRenderer,
    ) {}

    public function handleRequest(ServerRequestInterface $request): ResponseInterface
    {
        $view = $this->moduleTemplateFactory->create($request);
        // The frontend resolves its labels via `import labels from
        // '~labels/package_manager.module'` (TYPO3 v14 virtual import)
        // — no `addInlineLanguageLabelFile` call needed here.
        $this->pageRenderer->loadJavaScriptModule('@typo3/package-manager/package-manager.js');

        return $view->renderResponse('PackageManager/Index');
    }
}
