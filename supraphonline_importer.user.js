// ==UserScript==
// @name        Import Supraphonline releases into MusicBrainz
// @namespace   https://github.com/scarlett-blake/musicbrainz-userscripts/
// @version     2024.2.11
// @description Add a button on Metal Archives release pages allowing to open MusicBrainz release editor with pre-filled data for the selected release
// @download    https://raw.github.com/scarlett-blake/musicbrainz-userscripts/master/supraphonline_importer.user.js
// @update      https://raw.github.com/scarlett-blake/musicbrainz-userscripts/master/supraphonline_importer.user.js
// @include     http*://www.supraphonline.cz/album/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require     lib/mbimport.js
// @require     lib/mbimportstyle.js
// @require     lib/logger.js
// @icon        https://raw.githubusercontent.com/murdos/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

$(document).ready(function () {
    MBImportStyle();
    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
    LOGGER.info('Parsed release: ', release);
});

function retrieveReleaseInfo(release_url) {
    let release = {
        discs: [],
        artist_credit: [],
        title: '',
        year: 0,
        month: 0,
        day: 0,
        parent_album_url: '',
        labels: [],
        format: '',
        country: [],
        type: 'Album',
        status: 'official',
        packaging: '',
        language: '',
        script: 'Latn',
        urls: [],
    };

    /********** Release name and artist *********/

    // title block containing artist and release name
    let titleBlock = $('div.visible-lg-block')

    // get the release name
    release.title = titleBlock.children('h1').text();

    // get a list of artist from title block
    let artists = titleBlock.find('.album-artist a')
    // loop over each artist
    artists.each(function (index) {
        // get artist text
        let artist = $(this).text();

        // determine join phrase based on the position of the artist in the list
        let joinphrase = '';
        // two artists get an ampersand
        if (artists.length == 2) {
            joinphrase = index != 1 ? ' & ' : '';
            // three and more get commas
        } else if (artists.length > 2) {
            joinphrase = index != artists.length - 1 ? ', ' : '';
        }
        // add a dict to the release
        release.artist_credit.push({
            artist_name: artist,
            credited_name: artist,
            joinphrase: joinphrase
        });
    });

    // sidebar block containing label, catno and date
    let releaseBlock = $('form.visible-lg-block');

    // get a list of items within the block
    let items = releaseBlock.find('li');

    // vars we'll use for label info
    let release_catno;
    let labels = [];
    let countries = [];

    // loop over each item
    items.each(function () {

        // the label (not release label, but the label text)
        let child_span = $(this).children('span').text();

        // the value without label text
        let value_without_span = $(this).children().not('span').text();
        if (value_without_span == '') {
            value_without_span = $(this).clone().children().remove().end().text();
        }

        // strip leading space if necessary
        if (value_without_span.slice(0, 1) == ' ') {
            value_without_span = value_without_span.slice(1);
        }

        // handle release date
        if (child_span == 'Datum vydání:') {

            let date_split = value_without_span.split(/\.\s|\./);
            release.day = date_split[0];
            release.month = date_split[1];
            release.year = date_split[2];

            // handle release label
        } else if (child_span == 'Vydavatel:') {

            // split on slash, since that usually denotes multiple labels and
            // few labels contain a slash in their name
            labels = [...labels, ...value_without_span.split('/')];

            // handle catno
        } else if (child_span == 'Katalogové číslo:') {
            release_catno = value_without_span;

        } else if (child_span == 'Nosič:' && value_without_span in ReleaseFormat) {
                release.format = ReleaseFormat[value_without_span];
                countries = ['CZ','SK'];
                release.urls.push({
                    url: release_url,
                    link_type: MBImport.URL_TYPES.discography,
                });
                release.urls.push({
                    url: release_url,
                    link_type: MBImport.URL_TYPES.purchase_for_mail_order,
                });
        }


    });

    // push release label and catno. Loop over all labels
    labels.forEach(function(label) {

        let label_mbid = ''

        // check if label is one of the frequent ones
        if (label in LabelsMapping) {
            // if it is, use its mbid value
            label_mbid = LabelsMapping[label];
        }

        // push the entry into the output dict
        release.labels.push({
            name: label,
            catno: release_catno,
            mbid: label_mbid,
        });
    });

    // push countries
    console.log(countries)
    if (countries == []) {

        release.format = 'Digital media';
        release.country = ['XW'];
        release.urls.push({
            url: release_url,
            link_type: MBImport.URL_TYPES.discography,
        });
        release.urls.push({
            url: release_url,
            link_type: MBImport.URL_TYPES.purchase_for_download,
        });
    }

    countries.forEach(function(country_) {
        release.country.push({
            day: release.day,
            month: release.month,
            year: release.year,
            country: country_
        });
    });

    // table with tracks
    tracklistTable = $('table.table-tracklist');

    // get all tracks, including medium separators, excluding garbage
    tracklistArray = tracklistTable.find('tr.cd-header, tr.track:not(.track-none)')

    let discNumber = 1;
    let disc = {
        tracks: [],
        format: release.format,
    };
    release.discs.push(disc)

    tracklistArray.each(function(index) {

        // check if the element is a medium separator
        if ($(this).hasClass('cd-header')) {
            // don't do any of this if the first medium has a header
            if (index > 0) {
                discNumber++;
            }
            // if it isn't the first medium, reset the disc dict
            if (discNumber > 1) {
                release.discs.push({
                        tracks: [],
                        format: release.format
                });
                // increment the medium
            }

        // otherwise we expect it to be a track
        } else if ($(this).hasClass('track')) {

            // find the table cells which contain track info within the row
            let cells = $(this).find('td.small.text-center');
            let trackNumber;
            let trackTitle;
            let trackDuration;

            // decide what to do for each cell
            cells.each(function() {
                // check the webpage source to see what these are about
                if ($(this).find('[itemprop="name"]:first').length) {
                    trackNumber = $(this).text().replace(/[\.\n\t]/g, '');
                    trackTitle = $(this).find('[itemprop="name"]').attr('content');
                } else if ($(this).find('[itemprop="duration"]:first').length) {
                    trackDuration = $(this).text().replace(/[\n\t]/g, '');
                }
            });

            // push the track into the current medium
            let track = {
                number: trackNumber,
                title: trackTitle,
                duration: trackDuration,
                artist_credit: [release.artist_credit]
            }

            release.discs[discNumber-1].tracks.push(track)
        }
    });

    return release;
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'Supraphonline');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(`<div id="musicbrainz-import">${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}</div>`).hide();

    $('div.visible-lg-block').after(mbUI);
    $('#musicbrainz-import form').css({
        padding: '0',
    });
    $('form.musicbrainz_import').css({
        display: 'inline-block',
        margin: '1px',
    });
    $('form.musicbrainz_import img').css({
        display: 'inline-block',
    });

    mbUI.slideDown();
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   Metal Archives -> MusicBrainz mapping                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/*
release.type 	primary type release 	secondary release type
on MA				on MB

Full-length 		Album				Compilation
Live album			Single				Demo
Demo				EP					DJ-mix
Single				Broadcast			Interview
EP					Other				Live
Video									Audiobook
Boxed set								Mixtape/Street
Split									Remix
Video/VHS (legacy)						Soundtrack
Compilation								Spokenword
Split video
*/

//ReleaseTypes[MAtype]=["primary type","secondary type on mb"];
var ReleaseTypes = {
    'Full-length': ['album'],
    'Live album': ['album', 'live'],
    Demo: ['album', 'demo'],
    Single: ['single'],
    EP: ['ep'],
    Compilation: ['album', 'compilation'],
    Split: ['album'],
    Collaboration: [''],
};

//ReleaseFormat[MAformat]="MBformat";
// var ReleaseFormat = {
//     CD: 'CD',
//     '2CD': 'CD',
//     Vinyl: 'Vinyl',
//     '7" vinyl': '7" Vinyl',
//     '7" vinyl (33⅓ RPM)': '7" Vinyl',
//     '10" vinyl (33⅓ RPM)': '10" Vinyl',
//     '10" vinyl': '10" Vinyl',
//     '12" vinyl': '12" Vinyl',
//     '2 12" vinyls': '12" Vinyl',
//     '12" vinyl (33⅓ RPM)': '12" Vinyl',
//     Cassette: 'Cassette',
//     Digital: 'Digital Media',
// };

var ReleaseFormat = {
    LP: 'Vinyl',
    CD: 'CD'
}

var LabelsMapping = {
    'SUPRAPHON a.s.': 'ca7d624c-214c-4507-823f-972d96391625',
    'Prodejhudbu.cz': 'ca7d624c-214c-4507-823f-972d96391625',
    'Opus a.s.': '8c17ad67-3a7a-4ef2-b96c-ad20a44fcb67'
}