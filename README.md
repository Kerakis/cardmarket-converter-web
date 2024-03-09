# CardMarket to Moxfield CSV Converter

This project is a React application that fetches data from the Scryfall API based on CardMarket IDs provided in a CSV file. It processes the data and generates a new CSV file that can be imported into Moxfield. It also identifies and displays any missing CardMarket IDs.

## Features

- Upload a CSV file with CardMarket IDs
- Fetch data from the Scryfall API based on the uploaded IDs
- Generate a new CSV file with the fetched data
- Display any missing IDs
- Copy missing IDs to clipboard

## How to Use

1. Go to https://converter.kerakis.online/
2. Upload a CSV file with CardMarket IDs.
3. Click the "Load File" button to fetch data from the Scryfall API.
4. If there are any missing IDs, they will be displayed in a list. You can copy these IDs to your clipboard.
5. Click the "Download Moxfield CSV" button to download a new CSV file with the processed data.

## Dependencies

- React
- axios
- papaparse
- file-saver

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
