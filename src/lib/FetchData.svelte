<script lang="ts">
	import axios from 'axios';
	import Papa from 'papaparse';
	import fileSaver from 'file-saver';
	const { saveAs } = fileSaver;

	const year = new Date().getFullYear();

	function delay(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function scryfallGet(url: string, retries = 3): Promise<any> {
		try {
			return await axios.get(url);
		} catch (err: unknown) {
			const axiosErr = err as {
				response?: { status: number; data?: { details?: string } };
				message: string;
			};
			if (axiosErr.response?.status === 429 && retries > 0) {
				const details = axiosErr.response.data?.details ?? '';
				const match = details.match(/try again after (\d+) seconds/);
				const waitMs = match ? parseInt(match[1]) * 1000 : 60000;
				await delay(waitMs);
				return scryfallGet(url, retries - 1);
			}
			throw err;
		}
	}

	function getLanguageName(code: string | number): string {
		const languages: Record<string | number, string> = {
			1: 'English',
			2: 'French',
			3: 'German',
			4: 'Spanish',
			5: 'Italian',
			6: 'Simplified Chinese',
			7: 'Japanese',
			8: 'Portuguese',
			9: 'Russian',
			10: 'Korean',
			11: 'Traditional Chinese'
		};
		return languages[code] || '';
	}

	function getConditionName(code: string): string {
		const conditions: Record<string, string> = {
			MT: 'M',
			NM: 'NM',
			EX: 'LP',
			GD: 'MP',
			LP: 'MP',
			PL: 'HP',
			PO: 'D'
		};
		return conditions[code] || 'NM';
	}

	function getFoil(isFoil: string, finishes: string[]): string {
		if (isFoil === '1') {
			if (finishes.includes('etched') && !finishes.includes('foil')) {
				return 'etched';
			} else {
				return 'foil';
			}
		} else {
			return '';
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let data = $state<any[]>([]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let missingIds = $state<any[]>([]);
	let loading = $state(false);
	let error = $state<string | string[] | null>(null);
	let file = $state<File | null>(null);
	let fileContent = $state('');
	let fileChanged = $state(true);
	let copied = $state<boolean | null>(null);

	const disableLoadButton = $derived(loading || !fileChanged);
	const sortedMissingIds = $derived(
		[...missingIds].sort((a, b) => a.reason.localeCompare(b.reason))
	);

	function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const selectedFile = target.files?.[0];
		if (!selectedFile) return;

		file = selectedFile;
		fileChanged = true;
		error = null;

		const reader = new FileReader();
		reader.onload = function (e) {
			fileContent = (e.target as FileReader).result as string;
		};
		reader.onerror = function () {
			error = reader.error?.message ?? 'Unknown error reading file.';
		};
		reader.readAsText(selectedFile);
	}

	async function handleLoadFile() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const updates: Record<number, any> = {};

		if (!file) {
			error = 'No file selected.';
			missingIds = [];
			data = [];
			copied = false;
			fileChanged = false;
			return;
		}

		loading = true;
		error = null;
		missingIds = [];
		data = [];
		copied = false;

		Papa.parse(fileContent, {
			header: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			complete: async (results: any) => {
				const fields = results.meta.fields as string[];
				if (
					!(
						fields.includes('idProduct') ||
						(fields.includes('Product ID') &&
							fields.includes('Article') &&
							fields.includes('Expansion'))
					)
				) {
					error = [
						'Invalid file format.',
						'The file must include either an "idProduct" column header or all three of the following column headers: "Product ID", "Article", and "Expansion".',
						'Are you sure this is a CardMarket CSV file?'
					];
					loading = false;
					fileChanged = false;
					missingIds = [];
					data = [];
					copied = false;
					return;
				}

				for (let index = 0; index < results.data.length; index++) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const row: any = results.data[index];
					if (index > 0) await delay(1000);

					let isToken = '';
					let expansion = row.Expansion || '';
					let article = row.Article || '';

					expansion = expansion.replace(': Extras', '');
					if (['Mystery Booster', 'The List'].includes(expansion)) {
						expansion = 'PLST';
					} else if (expansion === '30th Anniversary Celebration') {
						expansion = 'P30A';
					}
					if (expansion.includes('Commander:')) {
						expansion = expansion.replace('Commander: ', '');
					}
					expansion = expansion.replace(': Promos', ' Promos');
					article = article.replace(/\(.*\)/, '');
					if (article.includes('Token')) {
						article = article.replace(/Token.*$/, '');
						expansion += ' Tokens';
						isToken = '+t:token';
					}

					const idProduct = row['Product ID'] || row.idProduct;
					const count = row.groupCount || row.Amount;
					const purchasePrice = row.price || row['Article Value'];

					if (row.Category && row.Category !== 'Magic Single') {
						missingIds = [
							...missingIds,
							{
								id: idProduct,
								line: index + 2,
								reason: 'This is not a Magic card.'
							}
						];
						continue;
					}

					try {
						const response = await scryfallGet(
							`https://api.scryfall.com/cards/cardmarket/${idProduct}`
						);
						if (response.status === 200) {
							const card = response.data;
							updates[index] = {
								Count: count,
								Name: card.name,
								Edition: card.set,
								Language: getLanguageName(row.idLanguage) || '',
								Foil: getFoil(row.isFoil, card.finishes),
								CollectorNumber: card.collector_number,
								Alter: row.isAltered === 'true' ? 'TRUE' : 'FALSE',
								Condition: getConditionName(row.condition) || 'NM',
								PurchasePrice: purchasePrice
							};
						}
					} catch (err: unknown) {
						const axiosErr = err as { response?: { status: number }; message: string };
						if (
							axiosErr.response &&
							axiosErr.response.status === 404 &&
							row.Article &&
							row.Expansion
						) {
							try {
								const response = await scryfallGet(
									`https://api.scryfall.com/cards/search?q=e%3A%22${expansion}%22+${article}${isToken}`
								);
								if (response.status === 200) {
									const card = response.data;
									updates[index] = {
										Count: count,
										Name: card.data[0].name,
										Edition: card.data[0].set,
										Language: getLanguageName(row.idLanguage) || '',
										Foil: getFoil(row.isFoil, card.data[0].finishes),
										CollectorNumber: card.data[0].collector_number,
										Alter: row.isAltered === 'true' ? 'TRUE' : 'FALSE',
										Condition: getConditionName(row.condition) || 'NM',
										PurchasePrice: purchasePrice
									};
									missingIds = [
										...missingIds,
										{
											id: idProduct,
											line: index + 2,
											name: card.data[0].name,
											uri: card.data[0].scryfall_uri,
											reason: 'The printing added to your Moxfield CSV may be incorrect.'
										}
									];
								}
							} catch (innerErr: unknown) {
								const innerAxiosErr = innerErr as {
									response?: { status: number };
									message: string;
								};
								if (
									innerAxiosErr.response &&
									innerAxiosErr.response.status == 404 &&
									row.Category == 'Magic Single'
								) {
									missingIds = [
										...missingIds,
										{
											id: idProduct,
											line: index + 2,
											name: article,
											expansion: expansion,
											reason: 'Unable to find this card on Scryfall.'
										}
									];
								}
							}
						} else if (axiosErr.response && axiosErr.response.status === 404 && !row.Category) {
							missingIds = [
								...missingIds,
								{
									id: idProduct,
									line: index + 2,
									reason: 'Scryfall is missing this CardMarket ID.'
								}
							];
						} else {
							if (axiosErr.response && axiosErr.response.status !== 404) {
								error = axiosErr.message;
							}
							fileChanged = false;
							data = [];
							copied = false;
						}
					}
				}

				data = Object.keys(updates)
					.sort((a, b) => Number(a) - Number(b))
					.map((key) => updates[Number(key)]);
				loading = false;
				fileChanged = false;
			},
			error: async (err: { message: string }) => {
				error = err.message;
				loading = false;
				missingIds = [];
				data = [];
				copied = false;
			}
		});
	}

	function downloadData() {
		const csv = Papa.unparse(data);
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		saveAs(blob, 'output.csv');
	}
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-tropical_indigo px-4 text-linen"
>
	<h1 class="mt-5 mb-2 text-center text-5xl font-bold lg:mb-24">
		CardMarket to Moxfield CSV Converter
	</h1>

	<input
		type="file"
		accept=".csv"
		onchange={handleFileUpload}
		class="my-4 w-full max-w-md rounded-md border border-linen bg-french_gray p-2 text-dark_purple shadow-md"
	/>

	<button
		onclick={handleLoadFile}
		class="my-4 w-full max-w-xs rounded-md border border-linen p-2 shadow-md {error
			? 'bg-slate_blue text-linen'
			: 'bg-french_gray text-dark_purple'}"
		disabled={disableLoadButton}
	>
		{#if error}
			Error
		{:else if loading}
			Loading
		{:else if fileChanged}
			Load CSV File
		{:else}
			Data Loaded
		{/if}
	</button>

	<div
		class="my-4 flex w-full max-w-3xl flex-col space-y-4 xl:max-w-6xl xl:flex-row xl:space-y-0 xl:space-x-4 {data.length >
		0
			? ''
			: 'xl:flex-col'}"
	>
		<textarea
			value={fileContent ||
				'Please load your CardMarket CSV file. The input data will show here once loaded.'}
			readonly
			class="h-50 resize-none rounded-md border border-linen bg-dark_purple p-2 shadow-md lg:h-125 {data.length >
			0
				? 'xl:w-1/2'
				: 'xl:w-full'}"
		></textarea>
		{#if data.length > 0}
			<textarea
				value={Papa.unparse(data)}
				readonly
				class="h-50 resize-none rounded-md border border-linen bg-dark_purple p-2 shadow-md lg:h-125 xl:w-1/2"
			></textarea>
		{/if}
	</div>

	{#if loading}
		<div class="my-4 w-full max-w-5xl rounded-md border border-linen bg-french_gray p-4 shadow-md">
			<p class="text-lg text-dark_purple">
				Loading...<br /><br />
				This may take a while depending on the size of your CSV file.
			</p>
		</div>
	{:else}
		{#if data.length > 0}
			<div class="w-full max-w-xs">
				<button
					onclick={downloadData}
					class="my-4 w-full rounded-md border border-linen bg-french_gray p-2 text-dark_purple shadow-md"
				>
					Download Moxfield CSV
				</button>
			</div>
		{/if}

		{#if missingIds.length > 0}
			<div
				class="my-4 max-h-64 w-full max-w-5xl overflow-auto rounded-md border border-linen bg-dark_purple p-4 shadow-md"
			>
				<h2 class="mb-2 text-center text-lg font-bold">Missing CardMarket IDs</h2>
				<div class="grid grid-cols-1 gap-1 sm:grid-cols-9">
					<div class="hidden sm:block"><strong>Line</strong></div>
					<div class="hidden sm:block"><strong>ID</strong></div>
					<div class="hidden sm:col-span-7 sm:block"><strong>Reason</strong></div>
					{#each sortedMissingIds as item, index (item.line)}
						<div class="sm:col-span-1">
							<span class="sm:hidden"><strong>Line: </strong></span>
							{item.line}
						</div>
						<div class="sm:col-span-1">
							<span class="sm:hidden"><strong>ID: </strong></span>
							{item.id}
						</div>
						<div class="sm:col-span-7">
							<span class="sm:hidden"><strong>Reason: </strong></span>
							{#if item.uri}
								This is likely <a href={item.uri} target="_blank" rel="external noopener noreferrer"
									><strong>{item.name}</strong></a
								>. {item.reason}
							{:else if item.expansion}
								{item.reason} This may be <strong>{item.name}</strong> from {item.expansion}.
							{:else}
								{item.reason}
							{/if}
						</div>
						{#if index < sortedMissingIds.length - 1}
							<hr class="sm:hidden" />
						{/if}
					{/each}
				</div>
			</div>

			<button
				onclick={() => {
					const missingIdsText = missingIds.map((item) => item.id).join('\n');
					navigator.clipboard.writeText(missingIdsText);
					copied = true;
					setTimeout(() => (copied = false), 2000);
				}}
				class="my-4 w-full max-w-xs rounded-md border border-linen bg-french_gray p-2 text-dark_purple shadow-md"
				disabled={copied ?? false}
			>
				{copied ? 'Copied!' : 'Copy Missing IDs'}
			</button>
		{/if}
	{/if}

	{#if error}
		<div class="my-4 w-full max-w-xl rounded-md border border-linen bg-slate_blue p-4 shadow-md">
			<h2 class="text-lg font-bold">Error</h2>
			{#if Array.isArray(error)}
				{#each error as errorMessage (errorMessage)}
					<p>{errorMessage}</p>
				{/each}
			{:else}
				<p>{error}</p>
			{/if}
		</div>
	{/if}

	<footer class="mt-8 shrink-0 text-center text-sm lg:fixed lg:right-1 lg:bottom-0 lg:m-1">
		<p>
			Made with <span class="font-sans">&#9749;</span> by
			<a href="https://github.com/Kerakis" target="_blank" rel="noopener noreferrer">
				&nbsp;Kerakis&nbsp;
			</a>
			© {year}
		</p>
	</footer>
</div>
