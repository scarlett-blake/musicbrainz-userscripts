// ==UserScript==
// @name        Import Supraphonline releases into MusicBrainz
// @namespace   https://github.com/scarlett-blake/musicbrainz-userscripts/
// @version     2018.2.18.1
// @description Add a button on Metal Archives release pages allowing to open MusicBrainz release editor with pre-filled data for the selected release
// @downloadURL https://raw.github.com/scarlett-blake/musicbrainz-userscripts/master/supraphonline_importer.user.js
// @update      https://raw.github.com/scarlett-blake/musicbrainz-userscripts/master/supraphonline_importer.user.js
// @include     http*://www.supraphonline.cz/album/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        lib/mbimport.js
// @require        lib/mbimportstyle.js
// @require        lib/logger.js
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
        type: '',
        status: 'official',
        packaging: '',
        language: '',
        script: '',
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
            console.log(value_without_span)
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

        } else if (child_span == 'Nosič:') {

            if (value_without_span in ReleaseFormat) {
                release.format = value_without_span;
                countries = ['CZ','SK'];
            } else {
                release.format = 'Digital media';
                release.country = ['XW'];
            }
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
    countries.forEach(function(country_) {
        release.country.push({
            day: release.day,
            month: release.month,
            year: release.year,
            country: country_
        });
    });


    // let rdata = getGenericalData();
    // let artists = getArtistsList();
    // let joinphrase = '';
    // if (artists.length > 1) {
    //     if (rdata['Type'] == 'Split') {
    //         joinphrase = ' / ';
    //     } else {
    //         joinphrase = ' & ';
    //     }
    // }
    // for (let i = 0; i < artists.length; i++) {
    //     release.artist_credit.push({
    //         artist_name: artists[i],
    //         credited_name: artists[i],
    //         joinphrase: i != artists.length - 1 ? joinphrase : '',
    //     });
    // }
    // release.title = $('h1.album_name').text();

    // release = setreleasedate(release, rdata['Release date']);
    // if ('Label' in rdata) {
    //     // TODO: add case for multiple labels if such a case exist
    //     let label = rdata['Label'];
    //     let label_mbid = '';
    //     if (label == 'Independent') {
    //         label = '[no label]';
    //         label_mbid = '157afde4-4bf5-4039-8ad2-5a15acc85176';
    //     }
    //     let catno = rdata['Catalog ID'];
    //     if (catno == undefined || catno == 'N/A') {
    //         catno = '';
    //     }
    //     release.labels.push({
    //         name: label,
    //         catno: catno,
    //         mbid: label_mbid,
    //     });
    // }

    // if (rdata['Type'] in ReleaseTypes) {
    //     let types = ReleaseTypes[rdata['Type']];
    //     release.type = types[0];
    //     // NOTE: secondary type may not be selected on MB editor, but it still works, a bug on MB side
    //     release.secondary_types = types.slice(1);
    // }

    // // FIXME: multiple vinyls ie. http://www.metal-archives.com/albums/Reverend_Bizarre/III%3A_So_Long_Suckers/415313
    // if (rdata['Format'] in ReleaseFormat) {
    //     release.format = ReleaseFormat[rdata['Format']];
    // }

    // if ('Version desc.' in rdata) {
    //     if (rdata['Version desc.'].indexOf('Digipak') != -1) {
    //         release.packaging = 'Digipak';
    //     }
    //     if (release.format == 'CD' && rdata['Version desc.'] == 'CD-R') {
    //         release.format = 'CD-R';
    //     }
    // }

    // let identifiers = $('#album_tabs_notes > div:nth-child(2)').find('p:not([class])').contents();
    // for (let j = 0; j < identifiers.length; j++) {
    //     if (identifiers[j].textContent.indexOf('Barcode:') != -1) {
    //         release.barcode = $.trim(identifiers[j].textContent.substring(8));
    //         break;
    //     }
    // }

    // // URLs
    // let link_type = MBImport.URL_TYPES;
    // release.urls.push({
    //     url: release_url,
    //     link_type: link_type.other_databases,
    // });

    // let releaseNumber = 0;
    // let disc = {
    //     tracks: [],
    //     format: release.format,
    // };
    // release.discs.push(disc);

    // let tracksline = $('table.table_lyrics tr.even,table.table_lyrics tr.odd');

    // tracksline.each(function (index, element) {
    //     let trackNumber = $.trim(element.children[0].textContent).replace('.', '');
    //     if (trackNumber == '1' && trackNumber != index + 1) {
    //         releaseNumber++;
    //         release.discs.push({
    //             tracks: [],
    //             format: release.format,
    //         });
    //     }

    //     // TODO: handling of split and compilation artists (artist - title)
    //     let track = {
    //         number: trackNumber,
    //         title: $.trim(element.children[1].textContent.replace(/\s+/g, ' ')),
    //         duration: $.trim(element.children[2].textContent),
    //         artist_credit: [release.artist_credit],
    //     };
    //     release.discs[releaseNumber].tracks.push(track);
    // });


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