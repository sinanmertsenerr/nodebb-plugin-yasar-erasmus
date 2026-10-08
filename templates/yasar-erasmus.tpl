{{{ if breadcrumbs.length }}}
<div class="yer-crumbs"><!-- IMPORT partials/breadcrumbs.tpl --></div>
{{{ end }}}
<!-- IMPORT partials/yasar-erasmus/icons.tpl -->
{{aboveHtml}}
<div data-yer-root data-data-url="{dataUrl}" data-topics-url="{topicsUrl}" data-cid="{categoryId}" data-start="{start}">
	{{{ if innerHtml }}}
	<div class="yer" aria-busy="true">{{innerHtml}}</div>
	{{{ else }}}
	<div class="yer" aria-busy="true">
		<div class="yer-skel" role="status">
			<span class="yer-sr">Erasmus+ yükleniyor</span>
			<div class="yer-skel__bar yer-skel__bar--title"></div>
			<div class="yer-skel__chips"><i></i><i></i><i></i><i></i><i></i><i></i></div>
			<div class="yer-skel__rows"><i></i><i></i><i></i><i></i><i></i></div>
		</div>
		<noscript><p class="yer-note">Erasmus+ sayfası için tarayıcında JavaScript açık olmalı.</p></noscript>
	</div>
	{{{ end }}}
</div>
{{indexHtml}}
